import argparse
import logging
from copy import deepcopy

from sm.engine.mol_db import MolecularDB
from sm.engine.isocalc_wrapper import IsocalcWrapper, set_centroids_cache_enabled
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB
from sm.engine.es_export import ESExporter, ESIndexManager


def get_inactive_index_es_config(es_config):
    es_man = ESIndexManager(es_config)
    old_index = es_man.internal_index_name(es_config['index'])
    new_index = es_man.another_index_name(old_index)
    tmp_es_config = deepcopy(es_config)
    tmp_es_config['index'] = new_index

    return tmp_es_config


def _reindex_all(conf):
    es_config = conf['elasticsearch']
    inactive_es_config = get_inactive_index_es_config(es_config)
    alias = es_config['index']
    es_man = ESIndexManager(es_config)
    old_index = es_man.internal_index_name(alias)
    new_index = es_man.another_index_name(old_index)
    es_man.create_index(new_index)

    try:
        db = DB(conf['db'])
        es_exp = ESExporter(db, inactive_es_config)
        ds_ids = [r[0] for r in db.select('select id from dataset')]
        _reindex_datasets(ds_ids, db, es_exp)

        es_man.remap_alias(inactive_es_config['index'], alias=alias)
    except Exception as e:
        es_man.delete_index(new_index)
        raise e
    else:
        es_man.delete_index(old_index)


def _reindex_datasets(ds_ids, db, es_exp):
    logger.info('Reindexing %s dataset(s)', len(ds_ids))
    for idx, ds_id in enumerate(ds_ids):
        logger.info(f'Reindexing {idx+1} out of {len(ds_ids)}')
        try:
            # Delete from ES regardless of whether the DS exists, so that this can clean up deleted datasets
            es_exp.delete_ds(ds_id)
            ds = db.select_one("select name, config from dataset where id = %s", (ds_id,))
            if ds:
                ds_name, ds_config = ds
                for mol_db_name in ds_config['databases']:
                    try:
                        mol_db = MolecularDB(name=mol_db_name, iso_gen_config=ds_config['isotope_generation'])
                        isocalc = IsocalcWrapper(ds_config['isotope_generation'])
                        es_exp.index_ds(ds_id, mol_db=mol_db, isocalc=isocalc)
                    except Exception as e:
                        new_msg = f'Failed to reindex(ds_id={ds_id}, ds_name={ds_name}, mol_db={mol_db_name}): {e}'
                        logger.error(new_msg, exc_info=True)
            else:
                logger.warning(f'Dataset does not exist(ds_id={ds_id})')
        except Exception as e:
            new_msg = 'Failed to reindex(ds_id={}): {}'.format(ds_id, e)
            logger.error(new_msg, exc_info=True)


def reindex_results(ds_id, ds_mask, use_inactive_index):
    assert ds_id or ds_mask

    conf = SMConfig.get_conf()
    set_centroids_cache_enabled(True)

    if ds_mask == '_all_':
        _reindex_all(conf)
    else:
        es_config = conf['elasticsearch']
        if use_inactive_index:
            es_config = get_inactive_index_es_config(es_config)

        db = DB(conf['db'])
        es_exp = ESExporter(db, es_config=es_config)

        if ds_id:
            ds_ids = ds_id.split(',')
        elif ds_mask:
            ds_ids = [id for (id,) in db.select("select id from dataset where name like '{}%'".format(ds_mask))]
        else:
            ds_ids = []

        _reindex_datasets(ds_ids, db, es_exp)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex dataset results')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--inactive', action='store_true', help='Run against the inactive index')
    parser.add_argument('--ds-id', dest='ds_id', default='', help='DS id (or comma-separated list of ids)')
    parser.add_argument('--ds-name', dest='ds_name', default='', help='DS name prefix mask (_all_ for all datasets)')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    reindex_results(args.ds_id, args.ds_name, args.inactive)
