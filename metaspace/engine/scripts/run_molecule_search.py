#!/usr/bin/env python
"""
Script for running molecule search
"""
import argparse
import logging
import sys

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.sm_daemons import SMDaemonManager
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import SMConfig, init_loggers, create_ds_from_files
from sm.engine.search_job import SearchJob


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('--ds-id', dest='ds_id', type=str, help='Dataset id')
    parser.add_argument('--ds-name', dest='ds_name', type=str, help='Dataset name')
    parser.add_argument('--input-path', type=str, help='Path to a dataset location')
    parser.add_argument('--no-clean', dest='no_clean', action='store_true',
                        help="Don't clean dataset txt files after job is finished")
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json',
                        type=str, help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()
    init_loggers(sm_config['logs'])

    db = DB(sm_config['db'])
    img_store = ImageStoreServiceWrapper(sm_config['services']['img_service_url'])
    manager = SMDaemonManager(db, ESExporter(db), img_store)

    try:
        ds = create_ds_from_files(args.ds_id, args.ds_name, args.input_path)
        manager.annotate(ds, SearchJob, del_first=True)
    except Exception as e:
        logging.getLogger('engine').error(e, exc_info=True)
        sys.exit(1)

    sys.exit()
