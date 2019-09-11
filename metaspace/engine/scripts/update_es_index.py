import argparse
import logging
from copy import deepcopy
from functools import partial

from sm.engine.db import DB
from sm.engine.es_export import ESExporter, ESIndexManager
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import bootstrap_and_run

logger = logging.getLogger('engine')


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
        db = DB()
        es_exp = ESExporter(db, inactive_es_config)
        ds_ids = [r[0] for r in db.select('select id from dataset')]
        _reindex_datasets(ds_ids, es_exp)

        es_man.remap_alias(inactive_es_config['index'], alias=alias)
    except Exception as e:
        es_man.delete_index(new_index)
        raise e
    else:
        es_man.delete_index(old_index)


def _reindex_datasets(ds_ids, es_exp):
    logger.info('Reindexing %s dataset(s)', len(ds_ids))
    for i, ds_id in enumerate(ds_ids, 1):
        logger.info(f'Reindexing {i} out of {len(ds_ids)}')
        es_exp.reindex_ds(ds_id)


def reindex_results(sm_config, ds_id, ds_mask, use_inactive_index):
    assert ds_id or ds_mask

    IsocalcWrapper.set_centroids_cache_enabled(True)

    if ds_mask == '_all_':
        _reindex_all(sm_config)
    else:
        es_config = sm_config['elasticsearch']
        if use_inactive_index:
            es_config = get_inactive_index_es_config(es_config)

        db = DB()
        es_exp = ESExporter(db, es_config=es_config)

        if ds_id:
            ds_ids = ds_id.split(',')
        elif ds_mask:
            ds_ids = [
                id
                for (id,) in db.select(
                    "select id from dataset where name like '{}%'".format(ds_mask)
                )
            ]
        else:
            ds_ids = []

        _reindex_datasets(ds_ids, es_exp)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex dataset results')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--inactive', action='store_true', help='Run against the inactive index')
    parser.add_argument(
        '--ds-id', dest='ds_id', default='', help='DS id (or comma-separated list of ids)'
    )
    parser.add_argument(
        '--ds-name', dest='ds_name', default='', help='DS name prefix mask (_all_ for all datasets)'
    )
    args = parser.parse_args()

    bootstrap_and_run(
        args.config,
        partial(
            reindex_results,
            ds_id=args.ds_id,
            ds_mask=args.ds_name,
            use_inactive_index=args.inactive,
        ),
    )
