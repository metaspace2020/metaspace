import argparse
import logging

from sm.engine import MolecularDB
from sm.engine.util import sm_log_config, init_logger, SMConfig
from sm.engine.db import DB
from sm.engine.es_export import ESExporter


def reindex_results(ds_id, ds_mask):
    assert ds_id or ds_mask

    conf = SMConfig.get_conf()
    db = DB(conf['db'])
    es_exp = ESExporter()

    if ds_mask == '_all_':
        es_exp.delete_index()
        es_exp.create_index()
        rows = db.select("select id, name, config from dataset")
    elif ds_id:
        rows = db.select("select id, name, config from dataset where id = '{}'".format(ds_id))
    elif ds_mask:
        rows = db.select("select id, name, config from dataset where name like '{}%'".format(ds_mask))
    else:
        rows = []

    logger.info('Reindexing %s dataset(s)', len(rows))
    for ds_id, ds_name, ds_config in rows:
        try:
            for mol_db_dict in ds_config['databases']:
                mol_db = MolecularDB(mol_db_dict['name'], mol_db_dict.get('version', None), ds_config)
                es_exp.index_ds(ds_id, mol_db)
        except Exception as e:
            logger.warn('Failed to reindex(ds_id=%s, ds_name=%s): %s', ds_id, ds_name, e, exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex dataset results')
    parser.add_argument('--config', default='conf/config.json', help="SM config path")
    parser.add_argument('--ds-id', dest='ds_id', default='', help="DS id")
    parser.add_argument('--ds-name', dest='ds_name', default='', help="DS name prefix mask (_all_ for all datasets)")
    args = parser.parse_args()

    init_logger()
    logger = logging.getLogger('sm-queue')
    SMConfig.set_path(args.config)

    reindex_results(args.ds_id, args.ds_name)
