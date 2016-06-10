#!/usr/bin/env python

import argparse
import boto3
from pprint import pprint
from time import sleep

ec2 = boto3.resource('ec2')
ec2_client = boto3.client('ec2')
#key_name = 'intsco_embl_aws'
image = 'ami-f9a62c8a'

webserver_block_dev_maps = [
    {
        'DeviceName': '/dev/sda1',
        'Ebs': {
            'VolumeSize': 100,
            'DeleteOnTermination': True,
            'VolumeType': 'gp2'
        }
    }
]

master_block_dev_maps = [
    {
        'DeviceName': '/dev/sda1',
        'Ebs': {
            'VolumeSize': 500,
            'DeleteOnTermination': True,
            'VolumeType': 'gp2',
        }
    }
]

slave_block_dev_maps = [
    {
        'DeviceName': '/dev/sda1',
        'Ebs': {
            'VolumeSize': 1000,
            'DeleteOnTermination': True,
            'VolumeType': 'gp2',
        }
    },
    # {
    #     'VirtualName': 'ephemeral0',
    #     'DeviceName': '/dev/sdb',
    # },
    # {
    #     'VirtualName': 'ephemeral1',
    #     'DeviceName': '/dev/sdc',
    # },
]


def find_inst_by_name(inst_name):
    instances = list(ec2.instances.filter(
            Filters=[{'Name': 'tag:Name', 'Values': [inst_name]},
                     {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
    return instances


def launch_inst(inst_name, inst_type, spot_price, inst_n, el_ip_id, sec_group, host_group, block_dev_maps):
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


def start_instances(inst_name, inst_type, spot_price, inst_n, el_ip_id, sec_group, host_group, block_dev_maps):
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
            launch_inst(inst_name, inst_type, spot_price, new_inst_n, el_ip_id, sec_group, host_group, block_dev_maps)

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

    web_name = 'sm-dev-webserver'
    master_name = 'sm-dev-master'
    slave_name = 'sm-dev-slave'

    web_inst_type = 'c4.large'
    master_inst_type = 'c4.xlarge'
    # slave_inst_type = 'i2.2xlarge'
    # slave_inst_type = 'c3.4xlarge'
    slave_inst_type = 'c4.4xlarge'

    if args.action == 'start':
        if args.component in ['web', 'all']:
            start_instances(web_name, web_inst_type, None, 1, 'eipalloc-0c08df69',
                            'sm web app', 'sm_webserver_aws', webserver_block_dev_maps)
        if args.component in ['spark', 'all']:
            start_instances(master_name, master_inst_type, None, 1, 'eipalloc-0ff2426a',
                            'default', 'sm_master_aws', master_block_dev_maps)
            start_instances(slave_name, slave_inst_type, 0.5, 1, None,
                            'default', 'sm_slave_aws', slave_block_dev_maps)

    elif args.action == 'stop':
        if args.component in ['web', 'all']:
            stop_instance('sm-dev-webserver')
        if args.component in ['spark', 'all']:
            stop_instance('sm-dev-master')
            stop_instance('sm-dev-slave', method='terminate')
