#!/usr/bin/env python
import argparse
import logging
import signal

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.sm_daemons import SMAnnotateDaemon, SMDaemonManager, SMUpdateDaemon
from sm.engine.queue import SM_ANNOTATE, SM_UPDATE, SM_DS_STATUS, QueuePublisher
from sm.engine.util import SMConfig, init_loggers


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('A daemon process for consuming messages from a '
                                                  'queue and performing dataset manipulations'))
    parser.add_argument('--name', type=str, help='SM daemon name (annotate/update)')
    parser.add_argument('--config', dest='config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.config_path)
    sm_config = SMConfig.get_conf()
    init_loggers(sm_config['logs'])
    logger = logging.getLogger(f'{args.name}-daemon')
    logger.info(f'Starting {args.name}-daemon')

    db = DB(sm_config['db'])
    status_queue_pub = QueuePublisher(config=sm_config['rabbitmq'],
                                      qdesc=SM_DS_STATUS,
                                      logger=logger)
    manager = SMDaemonManager(
        db=db, es=ESExporter(db),
        img_store=ImageStoreServiceWrapper(sm_config['services']['img_service_url']),
        status_queue=status_queue_pub,
        logger=logger
    )
    if args.name == 'annotate':
        daemon = SMAnnotateDaemon(manager=manager,
                                  annot_qdesc=SM_ANNOTATE,
                                  upd_qdesc=SM_UPDATE)
    elif args.name == 'update':
        daemon = SMUpdateDaemon(manager=manager,
                                update_qdesc=SM_UPDATE)
    else:
        raise Exception(f'Wrong SM daemon name: {args.name}')

    signal.signal(signal.SIGINT, lambda *args: daemon.stop())
    signal.signal(signal.SIGTERM, lambda *args: daemon.stop())

    daemon.start()
