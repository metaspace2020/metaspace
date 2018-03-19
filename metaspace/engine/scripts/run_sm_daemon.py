#!/usr/bin/env python
import argparse
import logging
import signal

from sm.engine.dataset_manager import SMDaemonDatasetManager
from sm.engine.sm_daemon import SMDaemon
from sm.engine.queue import SM_ANNOTATE
from sm.engine.util import SMConfig, init_logger, sm_log_config


def configure_loggers():
    log_config = sm_log_config
    log_config['loggers']['sm-engine']['handlers'] = ['console_warn', 'file']
    init_logger(log_config)


if __name__ == "__main__":
    configure_loggers()
    logger = logging.getLogger('sm-daemon')

    parser = argparse.ArgumentParser(description=('Daemon for consuming messages from the '
                                                  'queue and performing dataset manipulations'))
    parser.add_argument('--config', dest='config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.config_path)
    daemon = SMDaemon(SM_ANNOTATE, SMDaemonDatasetManager)

    signal.signal(signal.SIGINT, lambda *args: daemon.stop())
    signal.signal(signal.SIGTERM, lambda *args: daemon.stop())

    try:
        daemon.start()
    finally:
        if daemon:
            daemon.stop()
