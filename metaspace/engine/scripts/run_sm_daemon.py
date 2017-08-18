#!/usr/bin/env python
import argparse

from sm.engine import SMDaemonDatasetManager
from sm.engine.sm_daemon import SMDaemon
from sm.engine.queue import SM_ANNOTATE
from sm.engine.util import SMConfig

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('Daemon for consuming messages from the '
                                                  'queue and performing dataset manipulations'))
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    SMDaemon(SM_ANNOTATE, SMDaemonDatasetManager).start()
