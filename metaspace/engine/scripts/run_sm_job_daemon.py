#!/usr/bin/env python
import argparse
import json
from requests import post
import logging

from sm.engine.util import SMConfig, sm_log_formatters, sm_log_config, init_logger
from sm.engine.search_job import SearchJob
from sm.engine.queue import Queue


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

    def run_job_callback(ch, method, properties, body):
        log_msg = " [v] Received: {}".format(body)
        logger.info(log_msg)
        post_to_slack('new', log_msg)
        ch.basic_ack(delivery_tag=method.delivery_tag)

        try:
            msg = json.loads(body)
            job = SearchJob(msg['ds_id'], msg['ds_name'], msg.get('drop', False), msg['input_path'], args.sm_config_path)
            job.run()
        except BaseException as e:
            msg = ' [x] Failed: {}'.format(body)
            logger.error(msg)
            post_to_slack('hankey', msg)
        else:
            msg = ' [v] Finished: {}'.format(body)
            logger.info(msg)
            post_to_slack('dart', msg)

    annotation_queue = Queue(rabbit_config, 'sm_annotate')
    annotation_queue.start_consuming(run_job_callback)
