#!/usr/bin/env python
import argparse
import json
import logging
from time import sleep
import pika
import requests
import yaml
from fabric.api import local
from fabric.api import warn_only
import boto3.ec2


class ClusterDaemon(object):

    def __init__(self, conf_path, ansible_config_path, aws_key_name=None, interval=600,
                 qname='sm_annotate', debug=False):

        with open(conf_path) as fp:
            self.sm_config = json.load(fp)

        with open(ansible_config_path) as fp:
            self.ansible_config = yaml.load(fp)

        self.interval = interval
        self.aws_key_name = aws_key_name or self.ansible_config['aws_key_name']
        self.qname = qname
        self.debug = debug

        self._setup_logger()
        self.ec2 = boto3.resource('ec2', self.ansible_config['aws_region'])

    def _resolve_spark_master(self):
        self.logger.debug('Resolving spark master ip...')
        master_hostgroup = filter(lambda hgr: hgr['role'] == 'master',
                                  self.ansible_config['cluster_configuration']['instances'])[0]['hostgroup']
        spark_master_instances = list(self.ec2.instances.filter(
            Filters=[{'Name': 'tag:Name', 'Values': [master_hostgroup]},
                     {'Name': 'instance-state-name', 'Values': ['running', 'stopped', 'pending']}]))
        return spark_master_instances[0] if spark_master_instances else None

    @property
    def spark_master_public_ip(self):
        spark_master = self._resolve_spark_master()
        return spark_master.public_ip_address if spark_master else None

    @property
    def spark_master_private_ip(self):
        spark_master = self._resolve_spark_master()
        return spark_master.private_ip_address if spark_master else None

    def _setup_logger(self):
        self.logger = logging.getLogger('sm_cluster_auto_start')
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s %(name)-12s %(levelname)-8s %(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.DEBUG if self.debug else logging.INFO)

    def _send_rest_request(self, address):
        try:
            resp = requests.get(address)
        except Exception as e:
            self.logger.debug('{} - {}'.format(address, e))
            return False
        else:
            self.logger.debug(resp)
            return resp.ok

    def queue_empty(self):
        c = self.sm_config['rabbitmq']
        creds = pika.PlainCredentials(c['user'], c['password'])
        conn = pika.BlockingConnection(pika.ConnectionParameters(host=c['host'], credentials=creds))
        ch = conn.channel()
        m = ch.queue_declare(queue=self.qname, durable=True)
        self.logger.debug('Messages in the queue: {}'.format(m.method.message_count))
        return m.method.message_count == 0

    def cluster_up(self):
        return self._send_rest_request('http://{}:8080/api/v1/applications'.format(self.spark_master_public_ip))

    def job_running(self):
        return self._send_rest_request('http://{}:4040/api/v1/applications'.format(self.spark_master_public_ip))

    def _fab_local(self, command, success_msg, failed_msg):
        with warn_only():
            res = local(command, capture=True)
            self.logger.debug(res.stdout)

        if res.return_code > 0:
            self.logger.error(failed_msg)
        else:
            self.logger.info(success_msg)

    def cluster_start(self):
        self.logger.info('Spinning up the cluster...')
        self._fab_local("ansible-playbook -f 1 aws_start.yml -e 'component=spark'",
                        'Cluster is spun up', 'Failed to spin up the cluster')

    def cluster_stop(self):
        self.logger.info('Stopping the cluster...')
        self._fab_local("ansible-playbook -f 1 aws_stop.yml -e 'component=spark'",
                        'Cluster is stopped successfully', 'Failed to stop the cluster')

    def cluster_setup(self):
        self.logger.info('Setting up the cluster...')
        self._fab_local('ansible-playbook -f 1 aws_cluster_setup.yml',
                        'Cluster setup is finished', 'Failed to set up the cluster')

    def sm_engine_deploy(self):
        self.logger.info('Deploying SM engine code...')
        self._fab_local('ansible-playbook -f 1 engine_deploy.yml',
                        'The SM engine is deployed', 'Failed to deploy the SM engine')

    def start(self):
        self.logger.info('Started the SM cluster auto-start daemon (interval=%dsec)...', self.interval)
        while True:
            sleep(self.interval)

            if not self.queue_empty():
                if not self.cluster_up():
                    self.logger.info('Queue is not empty. Starting the cluster...')
                    self.cluster_start()
                    self.cluster_setup()
                    self.sm_engine_deploy()
                else:
                    if not self.job_running():
                        self.logger.warning('Queue is not empty. Cluster is up. But no job is running!')
            else:
                if self.cluster_up() and not self.job_running():
                    self.logger.info('Queue is empty. No jobs running. Stopping the cluster...')
                    self.cluster_stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Daemon for auto starting SM cluster')
    parser.add_argument('--sm-config', dest='sm_config_path', default='sm_config.json', type=str,
                        help='SM sm_config path')
    parser.add_argument('--ansible-config', dest='ansible_config_path', default='group_vars/all.yml', type=str,
                        help='Ansible config path')
    parser.add_argument('--debug', dest='debug', action='store_true', help="Run in debug mode")
    args = parser.parse_args()

    cluster_daemon = ClusterDaemon(args.sm_config_path, args.ansible_config_path,
                                   interval=15, qname='sm_annotate', debug=args.debug)
    cluster_daemon.start()
