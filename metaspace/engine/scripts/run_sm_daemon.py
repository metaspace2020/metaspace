#!/usr/bin/env python
import argparse
import logging
import signal
from functools import partial

from sm.engine.db import DB, ConnectionPool
from sm.engine.es_export import ESExporter
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.sm_daemons import SMAnnotateDaemon, DatasetManager, SMIndexUpdateDaemon
from sm.engine.queue import SM_ANNOTATE, SM_UPDATE, SM_DS_STATUS, QueuePublisher, QueueConsumer
from sm.engine.util import SMConfig, init_loggers


def get_manager():
    db = DB()
    status_queue_pub = QueuePublisher(
        config=sm_config['rabbitmq'], qdesc=SM_DS_STATUS, logger=logger
    )
    return DatasetManager(
        db=db,
        es=ESExporter(db, sm_config),
        img_store=ImageStoreServiceWrapper(sm_config['services']['img_service_url']),
        status_queue=status_queue_pub,
        logger=logger,
    )


def main(daemon_name):
    logger.info(f'Starting {daemon_name}-daemon')

    conn_pool = ConnectionPool(sm_config['db'])

    daemons = []
    if daemon_name == 'annotate':
        daemons.append(
            SMAnnotateDaemon(manager=get_manager(), annot_qdesc=SM_ANNOTATE, upd_qdesc=SM_UPDATE)
        )
    elif daemon_name == 'update':
        make_update_queue_cons = partial(
            QueueConsumer,
            config=sm_config['rabbitmq'],
            qdesc=SM_UPDATE,
            logger=logger,
            poll_interval=1,
        )
        for _ in range(sm_config['services']['update_daemon_threads']):
            daemon = SMIndexUpdateDaemon(get_manager(), make_update_queue_cons)
            daemons.append(daemon)
    else:
        raise Exception(f'Wrong SM daemon name: {daemon_name}')

    def cb_stop_daemons(*args):  # pylint: disable=redefined-outer-name
        logger.info(f'Stopping {daemon_name}-daemon')
        for d in daemons:  # pylint: disable=invalid-name
            d.stop()
        conn_pool.close()

    signal.signal(signal.SIGINT, cb_stop_daemons)
    signal.signal(signal.SIGTERM, cb_stop_daemons)

    for daemon in daemons:
        daemon.start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='A daemon process for consuming messages from a '
        'queue and performing dataset manipulations'
    )
    parser.add_argument('--name', type=str, help='SM daemon name (annotate/update)')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', type=str, help='SM config path'
    )
    args = parser.parse_args()

    SMConfig.set_path(args.config_path)
    sm_config = SMConfig.get_conf()
    init_loggers(sm_config['logs'])
    logger = logging.getLogger(f'{args.name}-daemon')

    main(args.name)
