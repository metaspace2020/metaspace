#!/usr/bin/env python
import argparse
import json
from requests import post
import logging

from sm.engine.util import SMConfig, sm_log_formatters, sm_log_config, init_logger
from sm.engine.search_job import SearchJob
from sm.engine.queue import QueueConsumer


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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('Daemon for reading messages from the '
                                                  'queue and starting annotation jobs'))
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    rabbit_config = SMConfig.get_conf()['rabbitmq']

    configure_loggers()
    logger = logging.getLogger('sm-queue')

    def run_job_callback(msg):
        post_to_slack('new', " [v] Received: {}".format(msg))
        job = SearchJob(msg['ds_id'], msg.get('ds_name', None),
                        msg.get('drop', False), msg.get('input_path', None),
                        args.sm_config_path)
        job.run()

    annotation_queue = QueueConsumer(rabbit_config, 'sm_annotate',
                                     run_job_callback,
                                     lambda log_msg: post_to_slack('dart', log_msg),
                                     lambda log_msg: post_to_slack('hankey', log_msg))
    annotation_queue.run()
