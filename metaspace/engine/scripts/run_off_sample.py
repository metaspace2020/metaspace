import argparse
import logging

from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.postprocessing.off_sample_wrapper import classify_dataset_ion_images
from sm.engine.util import GlobalInit

MISSING_OFF_SAMPLE_SEL = """
SELECT DISTINCT j.ds_id
FROM job j
JOIN annotation iim ON j.id = iim.job_id
WHERE j.status = 'FINISHED'
  AND iim.off_sample IS NULL
ORDER BY j.ds_id DESC;
"""

logger = logging.getLogger('engine')


def run_off_sample(sm_config, ds_ids_str, sql_where, fix_missing, overwrite_existing):
    db = DB()

    ds_ids = None
    if ds_ids_str:
        ds_ids = ds_ids_str.split(',')
    elif sql_where:
        ds_ids = [
            id for (id,) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')
        ]
    elif fix_missing:
        logger.info('Checking for missing off-sample jobs...')
        results = db.select(MISSING_OFF_SAMPLE_SEL)
        ds_ids = [ds_id for ds_id, in results]
        logger.info(f'Found {len(ds_ids)} missing off-sample sets')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    es_exp = ESExporter(db, sm_config)
    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'Running off-sample on {i+1} out of {len(ds_ids)}')
            ds = Dataset.load(db, ds_id)
            classify_dataset_ion_images(db, ds, sm_config['services'], overwrite_existing)
            es_exp.reindex_ds(ds_id)
        except Exception:
            logger.error(f'Failed to run off-sample on {ds_id}', exc_info=True)


def parse_args():
    parser = argparse.ArgumentParser(description='Run off-sample classification')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--ds-ids', dest='ds_ids', default=None, help='DS id (or comma-separated list of ids)'
    )
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "status = \'FINISHED\'"',
    )
    parser.add_argument(
        '--fix-missing',
        action='store_true',
        help='Run classification on all datasets that are missing off-sample data',
    )
    parser.add_argument(
        '--overwrite-existing',
        action='store_true',
        help='Run classification for annotations even if they have already been classified',
    )
    args = parser.parse_args()

    assert (
        sum(map(bool, [args.ds_ids, args.sql_where, args.fix_missing])) == 1
    ), "Exactly one data source (ds_id, sql_where, fix_missing) must be specified"

    return args


def main():
    args = parse_args()

    with GlobalInit(args.config) as sm_config:
        run_off_sample(
            sm_config,
            ds_ids_str=args.ds_ids,
            sql_where=args.sql_where,
            fix_missing=args.fix_missing,
            overwrite_existing=args.overwrite_existing,
        )


if __name__ == '__main__':
    main()
