import argparse
import logging

from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB
from sm.engine.colocalization import Colocalization

def run_coloc_jobs(ds_id, sql_where):
    assert ds_id or sql_where
    assert not (ds_id and sql_where)

    conf = SMConfig.get_conf()

    db = DB(conf['db'])

    if sql_where:
        ds_ids = [id for (id, ) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')]
    else:
        ds_ids = ds_id.split(',')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'Running colocalization on {i+1} out of {len(ds_ids)}')
            coloc = Colocalization(db)
            coloc.run_coloc_job_for_existing_ds(ds_id)
        except Exception:
            logger.error(f'Failed to run colocalization on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run colocalization jobs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)')
    parser.add_argument('--sql-where', dest='sql_where', default=None,
                        help='SQL WHERE clause for picking rows from the dataset table, e.g. "status = \'FINISHED\'"')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    run_coloc_jobs(args.ds_id, args.sql_where)
