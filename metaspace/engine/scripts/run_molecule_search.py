#!/usr/bin/env python
"""
Script for running molecule search
"""
import argparse
from pathlib import Path

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.daemons.dataset_manager import DatasetManager
from sm.engine.util import GlobalInit
from sm.engine.utils.create_ds_from_files import create_ds_from_files


def run_search(sm_config):
    db = DB()
    manager = DatasetManager(db, ESExporter(db, sm_config))

    config_path = args.config_path or Path(args.input_path) / 'config.json'
    meta_path = args.meta_path or Path(args.input_path) / 'meta.json'

    ds = create_ds_from_files(args.ds_id, args.ds_name, args.input_path, config_path, meta_path)
    if args.use_lithops:
        manager.annotate_lithops(ds, del_first=True)
    else:
        manager.annotate(ds, del_first=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('--ds-id', dest='ds_id', type=str, help='Dataset id')
    parser.add_argument('--ds-name', dest='ds_name', type=str, help='Dataset name')
    parser.add_argument('--input-path', type=str, help='Path to dataset')
    parser.add_argument('--config-path', type=str, help='Path to dataset config')
    parser.add_argument('--meta-path', type=str, help='Path to dataset metadata')
    parser.add_argument(
        '--lithops', dest='use_lithops', action='store_true', help='Use Lithops implementation'
    )
    parser.add_argument(
        '--config',
        dest='sm_config_path',
        default='conf/config.json',
        type=str,
        help='SM config path',
    )
    args = parser.parse_args()

    with GlobalInit(config_path=args.sm_config_path) as sm_config:
        run_search(sm_config)
