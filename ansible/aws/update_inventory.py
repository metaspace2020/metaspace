#!/usr/bin/env python

import argparse
from configparser import ConfigParser
import boto3
import yaml
from os import path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ansible inventory file updater')
    parser.add_argument('--stage', dest='stage', default='dev', type=str, help='One of dev/stage/prod')
    args = parser.parse_args()
    ansible_config_path = path.join(args.stage, 'group_vars/all.yml')
    ansible_config = yaml.load(open(ansible_config_path))
    inv_file = path.join(args.stage, 'hosts')

    with open(inv_file, 'w') as fp:
        fp.write('')
    inventory = ConfigParser(allow_no_value=True)
    inventory.read_file(open(inv_file))

    cred_dict = dict(aws_access_key_id=ansible_config['aws_access_key_id'],
                     aws_secret_access_key=ansible_config['aws_secret_access_key'])
    session = boto3.session.Session(**cred_dict)
    ec2 = session.resource('ec2', ansible_config['aws_region'])

    for component, spec in ansible_config['cluster_configuration']['instances'].items():
        print(component)

        if component not in inventory.sections():
            inventory.add_section(component)

        instances = list(ec2.instances.filter(
            Filters=[{'Name': 'tag:hostgroup', 'Values': [spec['hostgroup']]},
                     {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))

        c = 1
        for inst in instances:
            print(inst.public_ip_address)
            inst_name = '{}-{}'.format(component, str(c))
            inventory.set(component, '{} ansible_ssh_host={}'.format(inst_name, inst.public_ip_address))
            c += 1

    inventory.write(open(inv_file, 'w'))
