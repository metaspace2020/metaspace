#!/usr/bin/env python
import argparse
import json
import logging
from time import sleep
import pika
import requests
from requests import ConnectionError
import yaml
from subprocess import check_output
from subprocess import CalledProcessError
import boto3.ec2


class ClusterDaemon(object):
    def __init__(self, ansible_config_path, aws_key_name=None, interval=600,
                 qname='sm_annotate', debug=False):

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
        master_hostgroup = self.ansible_config['cluster_configuration']['instances']['master']['hostgroup']
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
        except ConnectionError as e:
            self.logger.debug('{} - {}'.format(address, e))
            return False
        except Exception as e:
            self.logger.warning('{} - {}'.format(address, e))
            return False
        else:
            self.logger.debug(resp)
            return resp.ok

    def queue_empty(self):
        try:
            creds = pika.PlainCredentials(self.ansible_config['rabbitmq_user'],
                                          self.ansible_config['rabbitmq_password'])
            conn = pika.BlockingConnection(pika.ConnectionParameters(host=self.ansible_config['rabbitmq_host'],
                                                                     credentials=creds))
            ch = conn.channel()
            m = ch.queue_declare(queue=self.qname, durable=True)
            self.logger.debug('Messages in the queue: {}'.format(m.method.message_count))
            return m.method.message_count == 0
        except Exception as e:
            self.logger.warning(e, exc_info=True)
            return True

    def cluster_up(self):
        return self._send_rest_request('http://{}:8080/api/v1/applications'.format(self.spark_master_public_ip))

    def job_running(self):
        return self._send_rest_request('http://{}:4040/api/v1/applications'.format(self.spark_master_public_ip))

    def _local(self, command, success_msg=None, failed_msg=None):
        try:
            res = check_output(command)
            self.logger.debug(res)
            self.logger.info(success_msg)
        except CalledProcessError as e:
            self.logger.warning(e.output)
            self.logger.error(failed_msg)
            raise e

    def cluster_start(self):
        self.logger.info('Spinning up the cluster...')
        self._local(['ansible-playbook', '-f', '1', 'aws_start.yml', '-e components=master,slave'],
                    'Cluster is spun up', 'Failed to spin up the cluster')

    def cluster_stop(self):
        self.logger.info('Stopping the cluster...')
        self._local(['ansible-playbook', '-f', '1', 'aws_stop.yml', '-e', 'components=master,slave'],
                    'Cluster is stopped successfully', 'Failed to stop the cluster')

    def cluster_setup(self):
        self.logger.info('Setting up the cluster...')
        self._local(['ansible-playbook', '-f', '1', 'aws_cluster_setup.yml'],
                    'Cluster setup is finished', 'Failed to set up the cluster')

    def sm_engine_deploy(self):
        self.logger.info('Deploying SM engine code...')
        self._local(['ansible-playbook', '-f', '1', 'engine_deploy.yml'],
                    'The SM engine is deployed', 'Failed to deploy the SM engine')

    def post_to_slack(self, emoji, msg):
        if not self.debug and self.ansible_config['slack_webhook_url']:
            msg = {
                "channel": self.ansible_config['slack_channel'],
                "username": "webhookbot",
                "text": ":{}: {}".format(emoji, msg),
                "icon_emoji": ":robot_face:"
            }
            requests.post(self.ansible_config['slack_webhook_url'], json=msg)

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
                    m = {
                        'master': self.ansible_config['cluster_configuration']['instances']['master'],
                        'slave': self.ansible_config['cluster_configuration']['instances']['slave']
                    }
                    self.post_to_slack('rocket', "[v] Cluster started: {}".format(m))
                else:
                    if not self.job_running():
                        self.logger.warning('Queue is not empty. Cluster is up. But no job is running!')
            else:
                if self.cluster_up() and not self.job_running():
                    self.logger.info('Queue is empty. No jobs running. Stopping the cluster...')
                    self.cluster_stop()
                    self.post_to_slack('checkered_flag', "[v] Cluster stopped")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Daemon for auto starting SM cluster')
    parser.add_argument('--ansible-config', dest='ansible_config_path', default='group_vars/all.yml', type=str,
                        help='Ansible config path')
    parser.add_argument('--debug', dest='debug', action='store_true', help="Run in debug mode")
    args = parser.parse_args()

    cluster_daemon = ClusterDaemon(args.ansible_config_path, interval=120, qname='sm_annotate', debug=args.debug)
    cluster_daemon.start()
