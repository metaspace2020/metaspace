#!/usr/bin/env python
import argparse
import os
import pika
import json
from requests import post
import traceback
import sys
import logging

from sm.engine.util import SMConfig
from sm.engine.search_job import SearchJob


def post_to_slack(emoji, msg):
    slack_conf = SMConfig.get_conf()['slack']

    if slack_conf['webhook_url']:
        msg = {"channel": slack_conf['channel'],
               "username": "webhookbot",
               "text": ":{}:{}".format(emoji, msg),
               "icon_emoji": ":robot_face:"}
        post(slack_conf['webhook_url'], json=msg)


def run_job_callback(ch, method, properties, body):
    msg = " [v] Received: {}".format(body)
    logger.info(msg)
    post_to_slack('new', msg)

    try:
        msg = json.loads(body)
        # FNULL = open(os.devnull, 'w')
        # cmd = ['scripts/run.sh', '{}/scripts/run_molecule_search.py'.format(os.getcwd()),
        #        job['ds_id'], job['input_path']]
        # if job['ds_name']:
        #     cmd.extend(['--ds-name', job['ds_name']])
        # check_call(cmd, cwd=os.getcwd(), stdout=FNULL, stderr=STDOUT)

        job = SearchJob(msg['ds_id'], msg['ds_name'], msg['input_path'], args.sm_config_path)
        job.run(clean=True)

    except BaseException as e:
        msg = ' [x] Failed: {}'.format(body)
        logger.error(msg)
        logger.error(''.join(traceback.format_exception(*sys.exc_info())))
        post_to_slack('hankey', msg)
    else:
        msg = ' [v] Finished: {}'.format(body)
        logger.info(msg)
        post_to_slack('dart', msg)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('Daemon for reading messages from the '
                                                  'queue and starting annotation jobs'))
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    rabbit_config = SMConfig.get_conf()['rabbitmq']

    creds = pika.PlainCredentials(rabbit_config['user'], rabbit_config['password'])
    conn = pika.BlockingConnection(pika.ConnectionParameters(host=rabbit_config['host'], credentials=creds))

    ch = conn.channel()
    ch.queue_declare(queue='sm_annotate')
    ch.basic_consume(run_job_callback,
                     queue='sm_annotate',
                     no_ack=True)

    sm_engine_logger = logging.getLogger(name='sm-engine')
    for hdl in sm_engine_logger.handlers:
        if type(hdl) is logging.StreamHandler:
            hdl.setLevel(logging.ERROR)

    logger = logging.getLogger(name='sm-job-daemon')
    hdl = logging.StreamHandler()
    hdl.setLevel(logging.DEBUG)
    logger.addHandler(hdl)

    logger.info(' [*] Waiting for messages...')
    ch.start_consuming()
