#!/usr/bin/env python
import argparse
import logging
import json

from sm.engine.db import DB
from sm.engine.config import init_loggers, SMConfig

ALL_DS_MASK = '_all_'
'''
The list of adducts below is a subject to customization before running the script.
'''
DEFAULT_ADDUCTS = {"Negative": ["-H", "+Cl"], "Positive": ["+H", "+Na", "+K"]}


def set_metadata_type(db, md_type, ds_name):
    ds_md_query = 'SELECT id, metadata from dataset {}'.format(
        'WHERE name = %s' if ds_name != ALL_DS_MASK else ''
    )
    for ds_id, metadata in db.select(ds_md_query, ds_name if ds_name else None):
        metadata['Data_Type'] = md_type
        metadata['metaspace_options']['Adducts'] = DEFAULT_ADDUCTS[
            metadata['MS_Analysis']['Polarity']
        ]
        db.alter('UPDATE dataset SET metadata = %s WHERE id = %s', json.dumps(metadata), ds_id)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Script for updating metadata in DB on per dataset basis'
    )
    parser.add_argument('--md-type', dest='md_type', type=str, help='Target metadata type')
    parser.add_argument(
        '--ds-name',
        dest='ds_name',
        type=str,
        help="DS name prefix mask ({} for all datasets)".format(ALL_DS_MASK),
    )
    parser.add_argument(
        '--config',
        dest='sm_config_path',
        default='conf/config.json',
        type=str,
        help='SM config path',
    )
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()

    init_loggers()
    logger = logging.getLogger('engine')

    if args.ds_name and args.md_type:
        set_metadata_type(DB(), args.md_type, args.ds_name)
    else:
        parser.print_help()
