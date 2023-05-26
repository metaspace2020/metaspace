import argparse
import logging
from copy import deepcopy

from sm.engine.db import DB
from sm.engine.es_export import ESExporter, ESIndexManager
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')


def get_inactive_dataset_index_es_config(es_config):
    es_man = ESIndexManager(es_config)
    old_index = es_man.internal_index_name(es_config['dataset_index'])
    new_index = es_man.another_index_name(old_index)
    tmp_es_config = deepcopy(es_config)
    tmp_es_config['index'] = new_index

    return tmp_es_config


def get_inactive_annotation_index_es_config(es_config):
    es_man = ESIndexManager(es_config)
    old_index = es_man.internal_index_name(es_config['annotation_index'])
    new_index = es_man.another_index_name(old_index)
    tmp_es_config = deepcopy(es_config)
    tmp_es_config['index'] = new_index

    return tmp_es_config


def _reindex_all(sm_config):
    es_config = sm_config['elasticsearch']
    es_man = ESIndexManager(es_config)

    dataset_alias = es_config['dataset_index']
    old_dataset_index = es_man.internal_index_name(dataset_alias)
    new_dataset_index = es_man.another_index_name(old_dataset_index)
    es_man.create_dataset_index(new_dataset_index)

    annotation_alias = es_config['annotation_index']
    old_annotation_index = es_man.internal_index_name(annotation_alias)
    new_annotation_index = es_man.another_index_name(old_annotation_index)
    es_man.create_annotation_index(new_annotation_index)

    try:
        inactive_dataset_es_config = get_inactive_dataset_index_es_config(es_config)
        inactive_annotation_es_config = get_inactive_annotation_index_es_config(es_config)
        db = DB()
        es_exp = ESExporter(db, {**sm_config, 'elasticsearch': inactive_dataset_es_config})
        ds_ids = [r[0] for r in db.select('SELECT id FROM dataset ORDER BY id')]
        _reindex_datasets(ds_ids, es_exp)

        es_man.remap_alias(inactive_dataset_es_config['index'], alias=dataset_alias)
        es_man.remap_alias(inactive_annotation_es_config['index'], alias=annotation_alias)
    except Exception as e:
        es_man.delete_index(new_dataset_index)
        es_man.delete_index(new_annotation_index)
        raise e
    else:
        es_man.delete_index(old_dataset_index)
        es_man.delete_index(old_annotation_index)


def _reindex_datasets(ds_ids, es_exp):
    logger.info(f'Reindexing {len(ds_ids)} dataset(s)')
    for i, ds_id in enumerate(ds_ids, 1):
        logger.info(f'Reindexing {i} out of {len(ds_ids)}')
        es_exp.reindex_ds(ds_id)


def _partial_update_datasets(ds_ids, es_exp, fields):
    logger.info(f'Updating {len(ds_ids)} dataset(s)')
    for i, ds_id in enumerate(ds_ids, 1):
        logger.info(f'Updating {i} out of {len(ds_ids)}')
        es_exp.update_ds(ds_id, fields)


def reindex_results(
    sm_config, ds_id, ds_mask, ds_file, use_inactive_index, offline_reindex, update_fields
):
    assert ds_id or ds_mask or ds_file or offline_reindex

    IsocalcWrapper.set_centroids_cache_enabled(True)

    if offline_reindex:
        _reindex_all(sm_config)
    else:
        es_config = sm_config['elasticsearch']
        if use_inactive_index:
            es_config = get_inactive_dataset_index_es_config(es_config)

        db = DB()
        es_exp = ESExporter(db, sm_config={**sm_config, 'elasticsearch': es_config})

        if ds_id:
            ds_ids = ds_id.split(',')
        elif ds_mask:
            ds_ids = [
                id
                for (id,) in db.select(
                    "SELECT id FROM dataset WHERE name like '{}%' ORDER BY id".format(ds_mask)
                )
            ]
        elif ds_file:
            with ds_file as file:
                ds_ids = [line.strip() for line in file.readlines()]
        else:
            ds_ids = []

        if update_fields:
            _partial_update_datasets(ds_ids, es_exp, update_fields.split(','))
        else:
            _reindex_datasets(ds_ids, es_exp)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex or update dataset results')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--inactive', action='store_true', help='Run against the inactive index')
    parser.add_argument('--ds-id', help='DS id (or comma-separated list of ids)')
    parser.add_argument('--ds-name', help='DS name prefix mask')
    parser.add_argument('--ds-file', type=argparse.FileType('r'), help='DS ids from the file')
    parser.add_argument('--offline-reindex', help='Create and populate inactive index then swap')
    parser.add_argument(
        '--update-fields',
        help='Comma-separated list of specific fields for update '
        '(runs faster in-place update instead of full reindex)',
    )
    args = parser.parse_args()

    with GlobalInit(config_path=args.config) as sm_config:
        reindex_results(
            sm_config=sm_config,
            ds_id=args.ds_id,
            ds_mask=args.ds_name,
            ds_file=args.ds_file,
            use_inactive_index=args.inactive,
            offline_reindex=args.offline_reindex,
            update_fields=args.update_fields,
        )
