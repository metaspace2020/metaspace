#!/usr/bin/env python
import argparse
import os
import sys
import pika
import json
from requests import post
import signal
import logging

from sm.engine.util import SMConfig, sm_log_formatters, sm_log_config, init_logger
from sm.engine.search_job import SearchJob


def configure_loggers():
    log_config = sm_log_config
    log_config['loggers']['sm-engine']['handlers'] = ['console_warn', 'file']
    init_logger(log_config)


def post_to_slack(emoji, msg):
    slack_conf = SMConfig.get_conf()['slack']

    if slack_conf['webhook_url']:
        msg = {"channel": slack_conf['channel'],
               "username": "webhookbot",
               "text": ":{}:{}".format(emoji, msg),
               "icon_emoji": ":robot_face:"}
        post(slack_conf['webhook_url'], json=msg)


def run_job_callback(ch, method, properties, body):
    log_msg = " [v] Received: {}".format(body)
    daemon_logger.info(log_msg)
    post_to_slack('new', log_msg)

    try:
        msg = json.loads(body)
        job = SearchJob(msg['ds_id'], msg['ds_name'], msg['input_path'], args.sm_config_path)
        job.run()
    except BaseException as e:
        msg = ' [x] Failed: {}'.format(body)
        daemon_logger.error(msg)
        post_to_slack('hankey', msg)
    else:
        ch.basic_ack(delivery_tag=method.delivery_tag)
        msg = ' [v] Finished: {}'.format(body)
        daemon_logger.info(msg)
        post_to_slack('dart', msg)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('Daemon for reading messages from the '
                                                  'queue and starting annotation jobs'))
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    rabbit_config = SMConfig.get_conf()['rabbitmq']

    configure_loggers()
    daemon_logger = logging.getLogger('sm-job-daemon')

    creds = pika.PlainCredentials(rabbit_config['user'], rabbit_config['password'])
    conn = pika.BlockingConnection(pika.ConnectionParameters(host=rabbit_config['host'], credentials=creds))

    ch = conn.channel()
    ch.queue_declare(queue='sm_annotate', durable=True)
    ch.basic_qos(prefetch_count=1)
    ch.basic_consume(run_job_callback,
                     queue='sm_annotate')

    def stop_consuming(signum, frame):
        ch.stop_consuming()
        daemon_logger.info(' [v] Stopped consuming')
        sys.exit()

    signal.signal(signal.SIGINT, stop_consuming)
    signal.signal(signal.SIGTERM, stop_consuming)

    daemon_logger.info(' [*] Waiting for messages...')
    ch.start_consuming()
