#!/usr/bin/env python
import argparse
import json
import logging
from datetime import datetime
from subprocess import CalledProcessError, check_output, STDOUT, Popen, PIPE
from time import sleep

import boto3
import pika
import redis
import requests
import yaml
from pika.exceptions import AMQPError
from requests import ConnectionError


class AnnotationQueue:
    def __init__(self, host, user, password, qname, logger):
        self.qname = qname
        self.logger = logger
        self.conn_params = pika.ConnectionParameters(
            host=host, heartbeat=0, credentials=pika.PlainCredentials(user, password)
        )
        self.conn = None

    def _get_channel(self):
        self.conn = pika.BlockingConnection(self.conn_params)
        return self.conn.channel()

    def _declare_queue(self, ch):
        return ch.queue_declare(queue=self.qname, durable=True, arguments={'x-max-priority': 3})

    def get_message_number(self):
        n_messages = 0
        try:
            ch = self._get_channel()
            m = self._declare_queue(ch)
            n_messages = m.method.message_count
        except AMQPError as e:
            self.logger.error(f'Failed to check message count: {e}')
        finally:
            if self.conn:
                self.conn.close()
        return n_messages

    def send_queue_exit_message(self):
        try:
            ch = self._get_channel()
            self._declare_queue(ch)
            ch.basic_publish(
                exchange='',
                routing_key=self.qname,
                body=json.dumps({'action': 'exit'}),
                properties=pika.BasicProperties(
                    priority=3, expiration='60000'  # max priority  # 60 sec ttl
                ),
            )
        except AMQPError as e:
            self.logger.error(f'Failed to publish exit message: {e}')
        finally:
            if self.conn:
                self.conn.close()


class ClusterDaemon:
    def __init__(
        self, ansible_config_path, aws_key_name=None, interval=60, qname='sm_annotate', debug=False
    ):
        with open(ansible_config_path) as fp:
            self.ansible_config = yaml.full_load(fp)

        self.interval = min(interval, 1200)
        self.aws_key_name = aws_key_name or self.ansible_config['aws_key_name']
        self.master_hostgroup = self.ansible_config['cluster_configuration']['instances']['master'][
            'hostgroup'
        ]
        self.slave_hostgroup = self.ansible_config['cluster_configuration']['instances']['slave'][
            'hostgroup'
        ]
        self.stage = self.ansible_config['stage']
        self.admin_email = self.ansible_config['notification_email']
        self.debug = debug
        self.cluster_started_at = None
        self.ansible_command_prefix = '{}/envs/{}/bin/ansible-playbook -f 1 -i {}'.format(
            self.ansible_config["miniconda_prefix"],
            self.ansible_config["miniconda_env"]["name"],
            self.stage,
        )

        self._setup_logger()
        self.queue = AnnotationQueue(
            self.ansible_config['rabbitmq_host'],
            self.ansible_config['rabbitmq_user'],
            self.ansible_config['rabbitmq_password'],
            qname,
            self.logger,
        )
        self.session = boto3.session.Session(
            aws_access_key_id=self.ansible_config['aws_access_key_id'],
            aws_secret_access_key=self.ansible_config['aws_secret_access_key'],
        )
        self.ec2 = self.session.resource('ec2', self.ansible_config['aws_region'])
        self.ses = self.session.client('ses', 'eu-west-1')
        self.redis_client = redis.Redis(**self.ansible_config.get('sm_cluster_autostart_redis', {}))

    def _resolve_spark_master(self):
        self.logger.debug('Resolving spark master ip...')
        spark_master_instances = list(
            self.ec2.instances.filter(
                Filters=[
                    {'Name': 'tag:hostgroup', 'Values': [self.master_hostgroup]},
                    {'Name': 'instance-state-name', 'Values': ['running', 'pending']},
                ]
            )
        )
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
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s[%(threadName)s] - %(filename)s:%(lineno)d - %(message)s'
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.DEBUG if self.debug else logging.INFO)

    def _send_email(self, email, subj, body):
        resp = self.ses.send_email(
            Source='contact@metaspace2020.eu',
            Destination={'ToAddresses': [email]},
            Message={'Subject': {'Data': subj}, 'Body': {'Text': {'Data': body}}},
        )
        if resp['ResponseMetadata']['HTTPStatusCode'] == 200:
            self.logger.info('Email with "{}" subject was sent to {}'.format(subj, email))
        else:
            self.logger.warning('SEM failed to send email to {}'.format(email))

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
        n = self.queue.get_message_number()
        self.logger.debug('Messages in the queue: {}'.format(n))
        return n == 0

    def spark_up(self):
        return self._send_rest_request(
            'http://{}:8080/api/v1/applications'.format(self.spark_master_private_ip)
        )

    def job_running(self):
        resp = self.redis_client.get('cluster-busy')
        return resp is not None and resp.decode('utf-8') == 'yes'

    def _local(self, command, success_msg=None, failed_msg=None):
        try:
            res = check_output(command.split(' '), universal_newlines=True)
            self.logger.debug(res)
            self.logger.info(success_msg)
        except CalledProcessError as e:
            self.logger.error(e.output)
            self.logger.error(failed_msg)
            raise e

    def cluster_start(self):
        self.logger.info('Spinning up the cluster...')
        self._local(
            f'{self.ansible_command_prefix} aws_start.yml -e components=master,slave',
            'Cluster is spun up',
            'Failed to spin up the cluster',
        )

    def min_uptime_over(self, minutes=10):
        if self.cluster_started_at:
            return (datetime.now() - self.cluster_started_at).total_seconds() > minutes * 60
        return True

    def cluster_stop(self):
        if self.queue_empty():
            self.queue.send_queue_exit_message()
            self.logger.info('No jobs running. Queue is empty. Queue exit message sent')
            self.logger.info('Stopping the cluster...')
            self._local(
                f'{self.ansible_command_prefix} aws_stop.yml -e components=master,slave',
                'Cluster is stopped successfully',
                'Failed to stop the cluster',
            )
            self._post_to_slack('checkered_flag', "[v] Cluster stopped")

    def cluster_setup(self):
        self.logger.info('Setting up the cluster...')
        self._local(
            f'{self.ansible_command_prefix} aws_cluster_setup.yml',
            'Cluster setup is finished',
            'Failed to set up the cluster',
        )

    def sm_engine_deploy(self):
        self.logger.info('Deploying SM engine code...')
        self._local(
            f'{self.ansible_command_prefix} deploy/spark.yml',
            'The SM engine is deployed',
            'Failed to deploy the SM engine',
        )

    def _post_to_slack(self, emoji, msg):
        if not self.debug and self.ansible_config['slack_webhook_url']:
            msg = {
                "channel": self.ansible_config['slack_channel'],
                "username": "webhookbot",
                "text": ":{}: {}".format(emoji, msg),
                "icon_emoji": ":robot_face:",
            }
            requests.post(self.ansible_config['slack_webhook_url'], json=msg)

    def _ec2_hour_over(self):
        spark_instances = list(
            self.ec2.instances.filter(
                Filters=[
                    {
                        'Name': 'tag:hostgroup',
                        'Values': [self.master_hostgroup, self.slave_hostgroup],
                    },
                    {'Name': 'instance-state-name', 'Values': ['running', 'pending']},
                ]
            )
        )
        launch_time = min([i.launch_time for i in spark_instances])
        now_time = datetime.utcnow()
        self.logger.debug('launch: {} now: {}'.format(launch_time, now_time))
        return (
            0 < (60 + (launch_time.minute - now_time.minute)) % 60 <= max(5, 2 * self.interval / 60)
        )

    def _try_start_setup_deploy(self, setup_failed_max=3):
        setup_failed = 0
        while True:
            try:
                self.logger.info(
                    'Queue is not empty. Starting the cluster (%s attempt)...', setup_failed + 1
                )
                self.cluster_start()
                m = {
                    'master': self.ansible_config['cluster_configuration']['instances']['master'],
                    'slave': self.ansible_config['cluster_configuration']['instances']['slave'],
                }
                self._post_to_slack('rocket', "[v] Cluster started: {}".format(m))

                self.cluster_setup()
                self.sm_engine_deploy()
                self._post_to_slack('motorway', "[v] Cluster setup finished, SM engine deployed")
                self.cluster_started_at = datetime.now()
                sleep(60)
            except Exception as e:
                self.logger.warning('Failed to start/setup/deploy cluster: %s', e)
                setup_failed += 1
                if setup_failed >= setup_failed_max:
                    raise e
            else:
                break

    def run(self):
        self.logger.info('Started SM cluster auto-start daemon (interval=%dsec)...', self.interval)
        try:
            while True:
                if not self.queue_empty():
                    if not self.spark_up():
                        self._try_start_setup_deploy()
                else:
                    if (
                        self.spark_master_public_ip is not None
                        and not self.job_running()
                        and self.min_uptime_over(minutes=30)
                    ):
                        self.cluster_stop()

                sleep(self.interval)
        except Exception as e:
            self.logger.error(e, exc_info=True)
            self._post_to_slack('sos', "[v] Something went wrong: {}".format(e))
            self._send_email(
                self.admin_email, 'Cluster auto start daemon ({}) failed'.format(self.stage), str(e)
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Daemon for auto starting SM cluster')
    parser.add_argument(
        '--ansible-config', dest='ansible_config_path', type=str, help='Ansible config path'
    )
    parser.add_argument(
        '--interval', type=int, default=120, help='Cluster status check interval in sec (<1200)'
    )
    parser.add_argument('--debug', dest='debug', action='store_true', help='Run in debug mode')
    args = parser.parse_args()

    cluster_daemon = ClusterDaemon(
        args.ansible_config_path, interval=args.interval, qname='sm_annotate', debug=args.debug
    )
    cluster_daemon.run()
