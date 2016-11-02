#!/usr/bin/env python

import argparse
import boto.ec2
import boto3
from pprint import pprint
from time import sleep
from yaml import load
from datetime import datetime, timedelta
import pandas as pd


class AWSInstManager(object):

    def __init__(self, key_name, conf, region='eu-west-1', dry_run=False):
        self.key_name = key_name
        self.region = region
        self.dry_run = dry_run
        self.ec2 = boto3.resource('ec2')
        self.ec2_client = boto3.client('ec2')
        self.conf = conf
        pprint(self.conf)

    def find_inst_by_name(self, inst_name):
        instances = list(self.ec2.instances.filter(
                Filters=[{'Name': 'tag:Name', 'Values': [inst_name]},
                         {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
        return instances

    def find_best_price_availability_zone(self, timerange_h, inst_type, platform='Linux/UNIX'):
        ec2 = boto.ec2.connect_to_region(self.region)
        price_hist = ec2.get_spot_price_history(
            start_time=(datetime.now() - timedelta(hours=timerange_h)).isoformat(),
            end_time=datetime.now().isoformat(),
            instance_type=inst_type,
            product_description=platform,
            max_results=10000)
        price_df = pd.DataFrame(map(lambda p: [p.availability_zone, p.region.name, p.price], price_hist),
                                columns=['az', 'r', 'p'])
        med_price_az_df = price_df.groupby('az').mean()
        return med_price_az_df.p.idxmin()

    def launch_inst(self, inst_name, inst_type, spot_price, inst_n, image, el_ip_id,
                    sec_group, host_group, block_dev_maps):
        print 'Launching {} new instances...'.format(inst_n)

        if not spot_price:
            insts = self.ec2.create_instances(
                DryRun=self.dry_run,
                KeyName=self.key_name,
                ImageId=image,
                MinCount=inst_n,
                MaxCount=inst_n,
                SecurityGroups=[sec_group],
                InstanceType=inst_type,
                BlockDeviceMappings=block_dev_maps
            )
        else:
            best_price_az = self.find_best_price_availability_zone(3, inst_type)
            spot_resp = self.ec2_client.request_spot_instances(
                DryRun=self.dry_run,
                SpotPrice=str(spot_price),
                InstanceCount=inst_n,
                Type='one-time',
                LaunchSpecification={
                    'ImageId': image,
                    'KeyName': self.key_name,
                    'SecurityGroups': [
                        sec_group,
                    ],
                    'InstanceType': inst_type,
                    'Placement': {
                        'AvailabilityZone': best_price_az
                    },
                    'BlockDeviceMappings': block_dev_maps
                }
            )
            sleep(5)  # to overcome Waiter SpotInstanceRequestFulfilled failed: The spot instance request ID does not exist

            spot_req_ids = [r['SpotInstanceRequestId'] for r in spot_resp['SpotInstanceRequests']]

            waiter = self.ec2_client.get_waiter('spot_instance_request_fulfilled')
            waiter.wait(
                SpotInstanceRequestIds=spot_req_ids
            )

            desc_resp = self.ec2_client.describe_spot_instance_requests(SpotInstanceRequestIds=spot_req_ids)
            insts = [self.ec2.Instance(r['InstanceId']) for r in desc_resp['SpotInstanceRequests']]

        waiter = self.ec2_client.get_waiter('instance_running')
        waiter.wait(InstanceIds=[inst.id for inst in insts])

        for inst in insts:
            inst.create_tags(
                Tags=[
                    {'Key': 'Name', 'Value': inst_name},
                    {'Key': 'hostgroup', 'Value': host_group}
                ])

        if el_ip_id:
            if inst_n == 1:
                webserver_address = self.ec2.VpcAddress(el_ip_id)
                webserver_address.associate(InstanceId=insts[0].id)
            else:
                print 'Wrong number of instances {} for just one IP address'.format(inst_n)

        print 'Launched {}'.format(insts)

    def start_instances(self, inst_name, inst_type, spot_price, inst_n, image, el_ip_id,
                        sec_group, host_group, block_dev_maps):
        print 'Start {} instance(s) of type {}, name={}'.format(inst_n, inst_type, inst_name)

        instances = self.find_inst_by_name(inst_name)
        new_inst_n = inst_n - len(instances)

        if len(instances) > inst_n:
            raise BaseException('More than {} instance with Name tag {} exist'.format(inst_n, inst_name))
        else:
            for inst in instances:
                if inst.state['Name'] in ['running', 'pending']:
                    print 'Already running: {}'.format(inst)
                elif inst.state['Name'] == 'stopped':
                    print 'Stopped instance found. Starting...'
                    self.ec2.instances.filter(InstanceIds=[inst.id]).start()
                else:
                    raise BaseException('Wrong state: {}'.format(inst.state['Name']))

            if new_inst_n > 0:
                self.launch_inst(inst_name, inst_type, spot_price, new_inst_n, image, el_ip_id,
                                 sec_group, host_group, block_dev_maps)

        print 'Success'

    def stop_instances(self, inst_name, method='stop'):
        instances = self.find_inst_by_name(inst_name)

        for inst in instances:
            if method == 'stop':
                resp = inst.stop()
            elif method == 'terminate':
                resp = inst.terminate()
            else:
                raise BaseException('Unknown instance stop method: {}'.format(method))
            pprint(resp)

    def start_all_instances(self, component):
        for i in self.conf['instances']:
            if component == 'all' or component in i['group']:
                self.start_instances(i['group'], i['type'], i['price'], i['n'], i['image'],
                                     i['elipalloc'], i['sec_group'], i['group'],
                                     i['block_dev_maps'])

    def stop_all_instances(self, component):
        for i in self.conf['instances']:
            if component == 'all' or component in i['group']:
                method = 'terminate' if 'slave' in i['group'] else 'stop'
                self.stop_instances(i['group'], method=method)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM AWS instances management tool')
    parser.add_argument('action', type=str, help='start|stop')
    parser.add_argument('component', type=str, help='all|web|spark|queue')
    parser.add_argument('key_name', type=str, help='AWS key name to use')
    args = parser.parse_args()

    conf = load(open('group_vars/all.yml'))['cluster_configuration']
    aws_inst_man = AWSInstManager(key_name=args.key_name, conf=conf)
    if args.action == 'start':
        aws_inst_man.start_all_instances(args.component)
    elif args.action == 'stop':
        aws_inst_man.stop_all_instances(args.component)
