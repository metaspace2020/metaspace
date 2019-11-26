#!/usr/bin/env python
import argparse
from configparser import ConfigParser
from os import path

import boto3
import yaml

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ansible inventory file updater')
    parser.add_argument(
        '--stage', dest='stage', default='dev', type=str, help='One of dev/stage/prod'
    )
    parser.add_argument(
        '--credentials-file', dest='cred_file', action='store_true', help='Use AWS credentials file'
    )
    args = parser.parse_args()
    ansible_config_path = path.join(args.stage, 'group_vars/all/vars.yml')
    ansible_config = yaml.full_load(open(ansible_config_path))
    inv_file = path.join(args.stage, 'hosts')

    with open(inv_file, 'w') as fp:
        fp.write('')
    inventory = ConfigParser(allow_no_value=True)
    inventory.read_file(open(inv_file))

    if args.cred_file:  # use default credentials file
        session = boto3.session.Session()
    else:
        session = boto3.session.Session(
            aws_access_key_id=ansible_config['aws_access_key_id'],
            aws_secret_access_key=ansible_config['aws_secret_access_key'],
        )

    ec2 = session.resource('ec2', ansible_config['aws_region'])

    for component, spec in ansible_config['cluster_configuration']['instances'].items():
        print(component)

        if component not in inventory.sections():
            inventory.add_section(component)

        instances = list(
            ec2.instances.filter(
                Filters=[
                    {'Name': 'tag:hostgroup', 'Values': [spec['hostgroup']]},
                    {'Name': 'instance-state-name', 'Values': ['running', 'pending']},
                ]
            )
        )

        c = 1
        for inst in instances:
            print(inst.public_ip_address)
            inst_name = '{}-{}'.format(component, str(c))
            inventory.set(
                component, '{} ansible_ssh_host={}'.format(inst_name, inst.public_ip_address)
            )
            c += 1

    inventory.write(open(inv_file, 'w'))
