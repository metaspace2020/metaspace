#!/usr/bin/env python
import argparse
from datetime import datetime as dt

from sm.engine.util import SMConfig, init_logger
from sm.engine.queue import Queue


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Script for adding messages to the job queue')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--ds-name', type=str, help='Dataset name')
    parser.add_argument('--ds-id', type=str, help='Dataset id')
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')

    init_logger()

    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    rabbit_config = SMConfig.get_conf()['rabbitmq']

    queue_writer = Queue(rabbit_config, 'sm_annotate')
    msg = {
        'ds_id': args.ds_id or dt.now().strftime("%Y-%m-%d_%Hh%Mm%Ss"),
        'ds_name': args.ds_name,
        'input_path': args.input_path
    }
    queue_writer.publish(msg)
