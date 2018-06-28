#!/usr/bin/env python
import argparse
import logging
from pprint import pformat

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.util import SMConfig, init_logger
from sm.engine import DatasetManager, Dataset


def delete_dataset(id, name):
    logger.info('Deleting dataset id/name: {}/{}'.format(id, name))
    ds = Dataset(id, name)
    ds_man = DatasetManager(db, es_exp, mode='local')
    ds_man.delete_ds(ds)


def match_and_delete_dataset(sql, arg):
    ds_to_del = db.select(sql, arg)
    if ds_to_del:
        if raw_input('Delete datasets:\n{}? (y/n):'.format(pformat(ds_to_del))) == 'y':
            for id, name in ds_to_del:
                delete_dataset(id, name)
        else:
            logger.info('Nothing was deleted')
    else:
        logger.info('No matching datasets to delete')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Script for deleting annotation results on per dataset basis')
    parser.add_argument('--ds-id', type=str, help='Dataset id')
    parser.add_argument('--ds-name', type=str, help='Dataset name mask')
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()

    init_logger()
    logger = logging.getLogger('engine')

    db = DB(sm_config['db'])
    es_exp = ESExporter(db)

    if args.ds_name:
        if args.ds_id:
            logger.info("Ignoring '--ds-id={}' argument".format(args.ds_id))

        match_and_delete_dataset("SELECT id, name FROM dataset WHERE name like %s", args.ds_name+'%')
    elif args.ds_id:
        if args.ds_name:
            logger.info("Ignoring '--ds-name={}' argument".format(args.ds_name))

        match_and_delete_dataset("SELECT id, name FROM dataset WHERE id=%s", args.ds_id)
    else:
        parser.print_help()
