#!/usr/bin/env python
import argparse
import os
import pika
import json
from subprocess import check_call, STDOUT, CalledProcessError
from requests import post

from sm.engine.util import SMConfig, logger


def post_to_slack(emoji, msg):
    slack_conf = SMConfig.get_conf()['slack']

    msg = {"channel": slack_conf['channel'],
           "username": "webhookbot",
           "text": ":{}:\n{}".format(emoji, msg),
           "icon_emoji": ":robot_face:"}
    post(slack_conf['webhook_url'], json=msg)


def run_job_callback(ch, method, properties, body):
    msg = " [v] Received: {}".format(body)
    logger.info(msg)
    post_to_slack('new', msg)

    try:
        job = json.loads(body)
        FNULL = open(os.devnull, 'w')
        check_call(['scripts/run.sh', '{}/scripts/run_molecule_search.py'.format(os.getcwd()),
                    job['ds_name'], job['input_path']], cwd=os.getcwd(), stdout=FNULL, stderr=STDOUT)
    except Exception:
        msg = ' [x] Failed: {}'.format(body)
        logger.error(msg)
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

    logger.info(' [*] Waiting for messages...')
    ch.start_consuming()
