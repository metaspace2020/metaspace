#!/usr/bin/env python

import argparse
import boto3
from pprint import pprint
from time import sleep
from yaml import load

ec2 = boto3.resource('ec2')
ec2_client = boto3.client('ec2')
conf = load(open('group_vars/all.yml'))['cluster_configuration']
pprint(conf)


def find_inst_by_name(inst_name):
    instances = list(ec2.instances.filter(
            Filters=[{'Name': 'tag:Name', 'Values': [inst_name]},
                     {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
    return instances


def launch_inst(inst_name, inst_type, spot_price, inst_n, image, el_ip_id, sec_group, host_group, block_dev_maps):
    print 'Launching {} new instances...'.format(inst_n)

    if not spot_price:
        insts = ec2.create_instances(
            # DryRun=True,
            KeyName=key_name,
            ImageId=image,
            MinCount=inst_n,
            MaxCount=inst_n,
            SecurityGroups=[sec_group],
            InstanceType=inst_type,
            BlockDeviceMappings=block_dev_maps
        )
    else:
        spot_resp = ec2_client.request_spot_instances(
            # DryRun=True|False,
            SpotPrice=str(spot_price),
            InstanceCount=inst_n,
            Type='one-time',
            LaunchSpecification={
                'ImageId': image,
                'KeyName': key_name,
                'SecurityGroups': [
                    sec_group,
                ],
                'InstanceType': inst_type,
                'BlockDeviceMappings': block_dev_maps
            }
        )
        sleep(5)  # to overcome Waiter SpotInstanceRequestFulfilled failed: The spot instance request ID does not exist

        spot_req_ids = [r['SpotInstanceRequestId'] for r in spot_resp['SpotInstanceRequests']]

        waiter = ec2_client.get_waiter('spot_instance_request_fulfilled')
        waiter.wait(
            SpotInstanceRequestIds=spot_req_ids
        )

        desc_resp = ec2_client.describe_spot_instance_requests(SpotInstanceRequestIds=spot_req_ids)
        insts = [ec2.Instance(r['InstanceId']) for r in desc_resp['SpotInstanceRequests']]

    waiter = ec2_client.get_waiter('instance_running')
    waiter.wait(InstanceIds=[inst.id for inst in insts])

    for inst in insts:
        inst.create_tags(
            Tags=[
                {'Key': 'Name', 'Value': inst_name},
                {'Key': 'hostgroup', 'Value': host_group}
            ])

    if el_ip_id:
        if inst_n == 1:
            webserver_address = ec2.VpcAddress(el_ip_id)
            webserver_address.associate(InstanceId=insts[0].id)
        else:
            print 'Wrong number of instances {} for just one IP address'.format(inst_n)

    print 'Launched {}'.format(insts)


def start_instances(inst_name, inst_type, spot_price, inst_n, image, el_ip_id, sec_group, host_group, block_dev_maps):
    print 'Start {} instance(s) of type {}, name={}'.format(inst_n, inst_type, inst_name)

    instances = find_inst_by_name(inst_name)
    new_inst_n = inst_n - len(instances)

    if len(instances) > inst_n:
        raise BaseException('More than {} instance with Name tag {} exist'.format(inst_n, inst_name))
    else:
        for inst in instances:
            if inst.state['Name'] in ['running', 'pending']:
                print 'Already running: {}'.format(inst)
            elif inst.state['Name'] == 'stopped':
                print 'Stopped instance found. Starting...'
                ec2.instances.filter(InstanceIds=[inst.id]).start()
            else:
                raise BaseException('Wrong state: {}'.format(inst.state['Name']))

        if new_inst_n > 0:
            launch_inst(inst_name, inst_type, spot_price, new_inst_n, image, el_ip_id, sec_group, host_group, block_dev_maps)

    print 'Success'


def stop_instance(inst_name, method='stop'):
    instances = find_inst_by_name(inst_name)

    for inst in instances:
        if method == 'stop':
            resp = inst.stop()
        elif method == 'terminate':
            resp = inst.terminate()
        else:
            raise BaseException('Unknown instance stop method: {}'.format(method))
        pprint(resp)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM AWS instances management tool')
    parser.add_argument('action', type=str, help='start|stop')
    parser.add_argument('component', type=str, help='all|web|spark')
    parser.add_argument('key_name', type=str, help='AWS key name to use')
    args = parser.parse_args()

    key_name = args.key_name

    if args.action == 'start':
        for i in conf['instances']:
            if args.component == 'all' or args.component in i['group']:
                start_instances(i['group'], i['type'], i['price'], i['n'], i['image'],
                                i['elipalloc'], i['sec_group'], i['group'],
                                i['block_dev_maps'])

    elif args.action == 'stop':
        for i in conf['instances']:
            if args.component == 'all' or args.component in i['group']:
                method = 'terminate' if 'slave' in i['group'] else 'stop'
                stop_instance(i['group'], method=method)
