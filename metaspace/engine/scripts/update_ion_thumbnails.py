import argparse
import logging
import sys

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.dataset import Dataset
from sm.engine.postprocessing.ion_thumbnail import (
    DEFAULT_ALGORITHM,
    ALGORITHMS,
    generate_ion_thumbnail,
    generate_ion_thumbnail_lithops,
)
from sm.engine.util import GlobalInit
from sm.engine.db import DB


def run(sm_config, ds_id_str, sql_where, algorithm, use_lithops):
    db = DB()

    if sql_where:
        ds_ids = [
            id for (id,) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')
        ]
    else:
        ds_ids = ds_id_str.split(',')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    if use_lithops:
        executor = Executor(sm_config['lithops'])

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'[{i+1} / {len(ds_ids)}] Generating ion thumbnail for {ds_id}')
            ds = Dataset.load(db, ds_id)
            if use_lithops:
                # noinspection PyUnboundLocalVariable
                generate_ion_thumbnail_lithops(executor, db, ds, algorithm=algorithm)
            else:
                generate_ion_thumbnail(db, ds, algorithm=algorithm)
        except Exception:
            logger.error(f'Failed on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run colocalization jobs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)'
    )
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "status = \'FINISHED\' and ion_thumbnail is null"',
    )
    parser.add_argument(
        '--algorithm',
        dest='algorithm',
        default=DEFAULT_ALGORITHM,
        help='Algorithm for thumbnail generation. Options: ' + str(list(ALGORITHMS.keys())),
    )
    parser.add_argument('--lithops', action='store_true', help='Use Lithops implementation')
    args = parser.parse_args()
    logger = logging.getLogger('engine')

    if not bool(args.ds_id) ^ bool(args.sql_where):
        parser.print_usage()
        print('error: must specify either --ds-id or --sql-where')
        sys.exit(1)

    with GlobalInit(config_path=args.config) as sm_config:
        run(
            sm_config=sm_config,
            ds_id_str=args.ds_id,
            sql_where=args.sql_where,
            algorithm=args.algorithm,
            use_lithops=args.lithops,
        )
