#!/usr/bin/env python
import argparse
from pprint import pprint
from time import sleep
from datetime import datetime, timedelta
from os import path
from subprocess import check_output
import sys
import boto3
from yaml import load


class AWSInstManager(object):

    def __init__(self, conf, aws_conf, dry_run=False, verbose=False):
        self.key_name = aws_conf['key_name']
        self.dry_run = dry_run
        session = boto3.session.Session(aws_access_key_id=aws_conf['aws_access_key_id'],
                                        aws_secret_access_key=aws_conf['aws_secret_access_key'])
        self.ec2 = session.resource('ec2', region_name=aws_conf['region'])
        self.ec2_client = session.client('ec2', region_name=aws_conf['region'])
        self.conf = conf
        if verbose:
            pprint(self.conf)

    def find_inst_by(self, host_group, first=False):
        instances = list(self.ec2.instances.filter(
                Filters=[{'Name': 'tag:hostgroup', 'Values': [host_group]},
                         {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
        print('The following instances found: {}'.format(instances))

        if first:
            assert len(instances) == 1, 'hostgroup {} has >1 instances'.format(host_group)
            return instances[0]
        else:
            return instances

    def find_best_price_availability_zone(self, timerange_h, inst_type, platform='Linux/UNIX'):
        price_hist = self.ec2_client.describe_spot_price_history(
            StartTime=(datetime.now() - timedelta(hours=timerange_h)).isoformat(),
            EndTime=datetime.now().isoformat(),
            InstanceTypes=[inst_type],
            ProductDescriptions=[platform],
            MaxResults=10000)
        prices = [(p['AvailabilityZone'], p['SpotPrice']) for p in price_hist['SpotPriceHistory']]
        sorted_prices = sorted(prices, key=lambda t: t[1])
        return sorted_prices[0][0]

    def assign_tags(self, inst, inst_name, host_group, inst_tags):
        if not inst_tags:
            inst_tags = {}
        tags = [
            {'Key': 'Name', 'Value': inst_name},
            {'Key': 'hostgroup', 'Value': host_group}
        ]
        for tag_name, tag_value in inst_tags.items():
            tags.append({'Key': tag_name, 'Value': tag_value})
        inst.create_tags(Tags=tags)

    def launch_new_inst(self, inst_type, spot_price, inst_n, image, el_ip_id,
                        sec_group, host_group, block_dev_maps):
        print('Launching {} new instances...'.format(inst_n))

        if not image:
            image = sorted(self.ec2.images.filter(Filters=[{'Name': 'tag:hostgroup', 'Values': [host_group]}]),
                           key=lambda img: img.creation_date)[-1].id

        if not spot_price:
            instances = self.ec2.create_instances(
                # DryRun=self.dry_run,
                KeyName=self.key_name,
                ImageId=image,
                MinCount=inst_n,
                MaxCount=inst_n,
                SecurityGroups=[sec_group],
                InstanceType=inst_type,
                BlockDeviceMappings=block_dev_maps,
                EbsOptimized=True
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
            instances = [self.ec2.Instance(r['InstanceId']) for r in desc_resp['SpotInstanceRequests']]

        waiter = self.ec2_client.get_waiter('instance_running')
        waiter.wait(InstanceIds=[inst.id for inst in instances])

        if el_ip_id:
            if inst_n == 1:
                elastic_ip = self.ec2.VpcAddress(el_ip_id)
                elastic_ip.associate(InstanceId=instances[0].id)
            else:
                print('Wrong number of instances {} for just one IP address'.format(inst_n))

        print('Launched {}'.format(instances))
        return instances

    def create_instances(self, inst_name, inst_type, inst_n, image,
                         sec_group, host_group, block_dev_maps,
                         spot_price=None, el_ip_id=None, inst_tags=None):
        print('Start {} instance(s) of type {}, name={}'.format(inst_n, inst_type, inst_name))
        instances = self.find_inst_by(host_group)
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
                    new_instances = self.launch_new_inst(inst_type, spot_price, new_inst_n, image, el_ip_id,
                                                         sec_group, host_group, block_dev_maps)
                    instances.extend(new_instances)

                for inst in instances:
                    self.assign_tags(inst, inst_name, host_group, inst_tags)
            else:
                print('DRY RUN!')

        print('Success')

    def stop_instances(self, host_group, method='stop'):
        instances = self.find_inst_by(host_group)

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

    def create_all_instances(self, components):
        for component in components:
            i = self.conf['instances'][component]
            self.create_instances(i['hostgroup'], i['type'], i['n'], i['image'],
                                  i['sec_group'], i['hostgroup'], i['block_dev_maps'],
                                  spot_price=i.get('price', None), el_ip_id=i['elipalloc'],
                                  inst_tags=i.get('tags', {}))

    def stop_all_instances(self, components):
        for component in components:
            i = self.conf['instances'][component]
            method = 'stop' if i['price'] is None else 'terminate'
            self.stop_instances(i['hostgroup'], method=method)

    def clone_prod_instance(self, suffix='beta'):
        i_conf = self.conf['instances']['web']
        inst = self.find_inst_by(i_conf['hostgroup'], first=True)

        image_name = "{}-{}".format(i_conf['hostgroup'], datetime.now().isoformat().replace(':', '-'))
        resp = self.ec2_client.create_image(InstanceId=inst.id,
                                            Name=image_name, NoReboot=True)
        print('Created image: {}'.format(resp))

        beta_host_group = '{}-{}'.format(i_conf['hostgroup'], suffix)
        self.create_instances(inst_name=i_conf['hostgroup'], inst_type=i_conf['type'],
                              inst_n=1, image=resp['ImageId'], sec_group=i_conf['sec_group'],
                              host_group=beta_host_group, block_dev_maps=i_conf['block_dev_maps'])

    def swap_prod_instance(self, suffix='beta'):
        prod_hostgroup = self.conf['instances']['web']['hostgroup']
        prod_inst = self.find_inst_by(prod_hostgroup, first=True)

        beta_hostgroup = '{}-{}'.format(self.conf['instances']['web']['hostgroup'], suffix)
        beta_inst = self.find_inst_by(beta_hostgroup, first=True)

        resp = self.ec2_client.create_tags(Resources=[beta_inst.id], Tags=prod_inst.tags)
        print('Updated beta instance tags: {}'.format(resp))
        resp = self.ec2_client.create_tags(Resources=[prod_inst.id], Tags=[
            {'Key': 'hostgroup', 'Value': ''},
            {'Key': 'Name', 'Value': '{}-old'.format(prod_hostgroup)}
        ])
        print('Updated prod instance tags: {}'.format(resp))

        resp = self.ec2_client.associate_address(AllocationId=self.conf['instances']['web']['elipalloc'],
                                                 InstanceId=beta_inst.id)
        print('Associated Elastic IP: {}'.format(resp))

        # resp = prod_inst.stop()
        # print('Stopped old prod instance: {}'.format(resp))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM AWS instances management tool')
    parser.add_argument('action', type=str, help='create|stop|clone|swap')
    parser.add_argument('--components', help='all,web,master,slave')
    parser.add_argument('--key-name', type=str, help='AWS key name to use')
    parser.add_argument('--stage', dest='stage', default='dev', type=str, help='One of dev/stage/prod')
    parser.add_argument('--create-ami', dest='create_ami', action='store_true')
    parser.add_argument('--dry-run', dest='dry_run', action='store_true',
                        help="Don't actually start/stop instances")
    args = parser.parse_args()

    conf_file = 'group_vars/all.yml' if not args.create_ami else 'group_vars/create_ami_config.yml'
    config_path = path.join(args.stage, conf_file)
    conf = load(open(config_path))
    cluster_conf = conf['cluster_configuration']

    aws_conf = {
        'key_name': args.key_name or conf['aws_key_name'],
        'region': conf['aws_region'],
        'aws_access_key_id': conf['aws_access_key_id'],
        'aws_secret_access_key': conf['aws_secret_access_key']
    }
    aws_inst_man = AWSInstManager(conf=cluster_conf, aws_conf=aws_conf,
                                  dry_run=args.dry_run, verbose=True)

    if args.components:
        components = args.components.strip(' ').split(',')
        if 'all' in components:
            components = ['web', 'master', 'slave', 'elk']
    else:
        components = []

    if args.action == 'create':
        aws_inst_man.create_all_instances(components)
    elif args.action == 'stop':
        aws_inst_man.stop_all_instances(components)
    elif args.action == 'clone':
        aws_inst_man.clone_prod_instance()
    elif args.action == 'swap':
        aws_inst_man.swap_prod_instance()
    else:
        raise Exception("Wrong action '{}'".format(args.action))

    cmd = '{} update_inventory.py --stage {}'.format(sys.executable, args.stage).split(' ')
    print('Inventory:\n{}'.format(check_output(cmd, universal_newlines=True)))
