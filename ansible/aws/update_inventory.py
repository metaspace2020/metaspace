#!/usr/bin/env python

from __future__ import print_function
import argparse
import ConfigParser
import boto3
import yaml


INVENTORY_FILE = 'hosts'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ansible inventory file updater')
    parser.add_argument('--config', dest='config_path', default='group_vars/all.yml', type=str,
                        help='Ansible config path')
    args = parser.parse_args()
    config = yaml.load(open(args.config_path))

    with open(INVENTORY_FILE, 'w') as fp:
        fp.write('')
    inventory = ConfigParser.RawConfigParser(allow_no_value=True)
    inventory.readfp(open(INVENTORY_FILE))

    ec2 = boto3.resource('ec2', config['aws_region'])

    for component, spec in config['cluster_configuration']['instances'].items():
        print(component)

        if component not in inventory.sections():
            inventory.add_section(component)

        instances = list(ec2.instances.filter(
            Filters=[{'Name': 'tag:hostgroup', 'Values': [spec['hostgroup']]},
                     {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
        c = 0
        for inst in instances:
            print(inst.public_ip_address)
            inst_name = component if c == 0 else component + str(c)

            inventory.set(component, '{} ansible_ssh_host={}'.format(inst_name, inst.public_ip_address))
            c += 1

    inventory.write(open(INVENTORY_FILE, 'w'))
