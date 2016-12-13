#!/usr/bin/env python
from __future__ import print_function
import argparse
import boto.ec2
import boto3
from pprint import pprint
from time import sleep
from yaml import load
from datetime import datetime, timedelta
import pandas as pd
from subprocess import check_output


class AWSInstManager(object):

    def __init__(self, key_name, conf, region='eu-west-1', dry_run=False, verbose=False):
        self.key_name = key_name
        self.region = region
        self.dry_run = dry_run
        self.ec2 = boto3.resource('ec2', region)
        self.ec2_client = boto3.client('ec2', region)
        self.conf = conf
        if verbose:
            pprint(self.conf)

    def find_inst_by_hostgroup(self, inst_name):
        instances = list(self.ec2.instances.filter(
                Filters=[{'Name': 'tag:hostgroup', 'Values': [inst_name]},
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
        print('Launching {} new instances...'.format(inst_n))

        if not image:
            image = sorted(self.ec2.images.filter(Filters=[{'Name': 'tag:hostgroup', 'Values': [host_group]}]),
                           key=lambda img: img.creation_date)[-1].id

        if not spot_price:
            insts = self.ec2.create_instances(
                # DryRun=self.dry_run,
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
                # DryRun=self.dry_run,
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
                elastic_ip = self.ec2.VpcAddress(el_ip_id)
                elastic_ip.associate(InstanceId=insts[0].id)
            else:
                print('Wrong number of instances {} for just one IP address'.format(inst_n))

        print('Launched {}'.format(insts))

    def start_instances(self, inst_name, inst_type, spot_price, inst_n, image, el_ip_id,
                        sec_group, host_group, block_dev_maps):
        print('Start {} instance(s) of type {}, name={}'.format(inst_n, inst_type, inst_name))
        instances = self.find_inst_by_hostgroup(inst_name)
        new_inst_n = inst_n - len(instances)

        if len(instances) > inst_n:
            raise BaseException('More than {} instance with Name tag {} exist'.format(inst_n, inst_name))
        else:
            if not self.dry_run:
                for inst in instances:
                    if inst.state['Name'] in ['running', 'pending']:
                        print('Already running: {}'.format(inst))
                    elif inst.state['Name'] == 'stopped':
                        print('Stopped instance found. Starting...')
                        self.ec2.instances.filter(InstanceIds=[inst.id]).start()
                    else:
                        raise BaseException('Wrong state: {}'.format(inst.state['Name']))

                if new_inst_n > 0:
                    self.launch_inst(inst_name, inst_type, spot_price, new_inst_n, image, el_ip_id,
                                     sec_group, host_group, block_dev_maps)
            else:
                print('DRY RUN!')

        print('Success')

    def stop_instances(self, inst_name, method='stop'):
        instances = self.find_inst_by_hostgroup(inst_name)

        if not self.dry_run:
            for inst in instances:
                if method == 'stop':
                    resp = inst.stop()
                elif method == 'terminate':
                    resp = inst.terminate()
                else:
                    raise BaseException('Unknown instance stop method: {}'.format(method))
                pprint(resp)
        else:
            print('DRY RUN!')

    def start_all_instances(self, components):
        for component in components:
            i = self.conf['instances'][component]
            self.start_instances(i['hostgroup'], i['type'], i['price'], i['n'], i['image'],
                                 i['elipalloc'], i['sec_group'], i['hostgroup'],
                                 i['block_dev_maps'])

    def stop_all_instances(self, components):
        for component in components:
            i = self.conf['instances'][component]
            self.stop_instances(i['hostgroup'], method='terminate')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM AWS instances management tool')
    parser.add_argument('action', type=str, help='start|stop')
    parser.add_argument('--components', help='all,web,master,slave,queue')
    parser.add_argument('--key-name', type=str, help='AWS key name to use')
    parser.add_argument('--config', dest='config_path', default='group_vars/all.yml', type=str,
                        help='Config file path')
    parser.add_argument('--dry-run', dest='dry_run', action='store_true',
                        help="Don't actually start/stop instances")
    args = parser.parse_args()

    conf = load(open(args.config_path))
    cluster_conf = conf['cluster_configuration']

    aws_inst_man = AWSInstManager(key_name=args.key_name or conf['aws_key_name'], conf=cluster_conf,
                                  dry_run=args.dry_run, verbose=True)

    components = filter(lambda x: x, args.components.strip(' ').split(','))
    if 'all' in components:
        components = ['web', 'master', 'slave', 'queue']

    if args.action == 'start':
        aws_inst_man.start_all_instances(components)
    elif args.action == 'stop':
        aws_inst_man.stop_all_instances(components)

    print(check_output('python update_inventory.py'.split(' ')))
