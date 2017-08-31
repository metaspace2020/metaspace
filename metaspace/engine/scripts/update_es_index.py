import argparse
import logging
import sys
from copy import deepcopy

from sm.engine import MolecularDB
from sm.engine.util import sm_log_config, init_logger, SMConfig
from sm.engine import DB
from sm.engine import ESExporter, ESIndexManager


def _reindex_all(conf):
    es_config = conf['elasticsearch']
    alias = es_config['index']
    es_man = ESIndexManager(es_config)
    new_index = es_man.another_index_name(es_man.internal_index_name(alias))
    es_man.create_index(new_index)

    tmp_es_config = deepcopy(es_config)
    tmp_es_config['index'] = new_index

    db = DB(conf['db'])
    es_exp = ESExporter(db, tmp_es_config)
    rows = db.select('select id, name, config from dataset')
    _reindex_datasets(rows, es_exp)

    es_man.remap_alias(tmp_es_config['index'], alias=alias)


def _reindex_datasets(rows, es_exp):
    logger.info('Reindexing %s dataset(s)', len(rows))
    for ds_id, ds_name, ds_config in rows:
        try:
            es_exp.delete_ds(ds_id)
            for mol_db_dict in ds_config['databases']:
                mol_db = MolecularDB(name=mol_db_dict['name'], version=mol_db_dict.get('version', None),
                                     iso_gen_config=ds_config['isotope_generation'])
                es_exp.index_ds(ds_id, mol_db)
        except Exception as e:
            new_msg = 'Failed to reindex(ds_id={}, ds_name={}): {}'.format(ds_id, ds_name, e)
            raise Exception(new_msg) from e


def reindex_results(ds_id, ds_mask):
    assert ds_id or ds_mask

    conf = SMConfig.get_conf()
    if ds_mask == '_all_':
        _reindex_all(conf)
    else:
        db = DB(conf['db'])
        es_exp = ESExporter(db)

        if ds_id:
            rows = db.select("select id, name, config from dataset where id = '{}'".format(ds_id))
        elif ds_mask:
            rows = db.select("select id, name, config from dataset where name like '{}%'".format(ds_mask))
        else:
            rows = []

        _reindex_datasets(rows, es_exp)


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
