#!/usr/bin/env python
import argparse
import os
import pika
import json
from subprocess import check_output

from sm.engine.util import SMConfig


def run_job_callback(ch, method, properties, body):
    print(" [x] Received %r" % body)

    job = json.loads(body)

    print check_output(['scripts/run.sh', '{}/scripts/run_molecule_search.py'.format(os.getcwd()),
                        job['ds_name'], job['input_path']],
                       cwd=os.getcwd())


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

    print(' [*] Waiting for messages. To exit press CTRL+C')
    ch.start_consuming()
