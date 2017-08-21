#!/usr/bin/env python
"""
Script for running molecule search
"""
import argparse
import json
import sys
from datetime import datetime as dt, datetime
from os.path import join, exists

from sm.engine import DB
from sm.engine import Dataset
from sm.engine import ESExporter
from sm.engine import SMDaemonDatasetManager
from sm.engine.errors import UnknownDSID
from sm.engine.util import SMConfig, logger, sm_log_config, init_logger, create_ds_from_files
from sm.engine.search_job import SearchJob


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('--ds-id', dest='ds_id', type=str, help='Dataset id')
    parser.add_argument('--ds-name', dest='ds_name', type=str, help='Dataset name')
    parser.add_argument('--input-path', type=str, help='Path to a dataset location')
    parser.add_argument('--no-clean', dest='no_clean', action='store_true',
                        help="Don't clean dataset txt files after job is finished")
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    args = parser.parse_args()

    init_logger()
    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()
    db = DB(sm_config['db'])
    ds_man = SMDaemonDatasetManager(db, ESExporter(db), mode='local')

    ds = None
    if args.ds_id:
        ds_id = args.ds_id
        try:
            ds = Dataset.load(db, ds_id)
            ds_man.delete(ds)
        except UnknownDSID as e:
            logger.warning(e.message)
    else:
        ds_id = dt.now().strftime("%Y-%m-%d_%Hh%Mm%Ss")

    try:
        if ds is None:
            ds = create_ds_from_files(ds_id, args.ds_name, args.input_path)
        search_job = SearchJob(no_clean=args.no_clean)
        ds_man.add(ds, search_job)
    except Exception as e:
        sys.exit(1)

    sys.exit()
