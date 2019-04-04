import argparse
import logging

from sm.engine.dataset import Dataset
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB
from sm.engine.off_sample_wrapper import classify_dataset_ion_images


MISSING_OFF_SAMPLE_SEL = """
SELECT DISTINCT j.ds_id
FROM job j
JOIN iso_image_metrics iim ON j.id = iim.job_id
WHERE j.status = 'FINISHED'
  AND iim.off_sample IS NULL
ORDER BY j.ds_id DESC;
"""


def run_off_sample(ds_id, sql_where, fix_missing):
    assert len([data_source for data_source in [ds_id, sql_where, fix_missing] if data_source]) == 1, \
           "Exactly one data source (ds_id, sql_where, fix_missing) must be specified"
    assert not (ds_id and sql_where)

    conf = SMConfig.get_conf()
    db = DB(conf['db'])

    if ds_id:
        ds_ids = ds_id.split(',')
    elif sql_where:
        ds_ids = [id for (id, ) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')]
    else:
        logger.info('Checking for missing off-sample jobs...')
        results = db.select(MISSING_OFF_SAMPLE_SEL)
        ds_ids = [ds_id for ds_id, in results]
        logger.info(f'Found {len(ds_ids)} missing off-sample sets')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'Running off-sample on {i+1} out of {len(ds_ids)}')
            classify_dataset_ion_images(db, Dataset(id=ds_id), conf['services'])
        except Exception:
            logger.error(f'Failed to run off-sample on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run off-sample classification')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)')
    parser.add_argument('--sql-where', dest='sql_where', default=None,
                        help='SQL WHERE clause for picking rows from the dataset table, e.g. "status = \'FINISHED\'"')
    parser.add_argument('--fix-missing', action='store_true',
                        help='Run classification on all datasets that are missing off-sample data')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    run_off_sample(ds_id=args.ds_id,
                   sql_where=args.sql_where,
                   fix_missing=args.fix_missing)
