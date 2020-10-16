import argparse
import logging
import sys
from functools import partial

from sm.engine.ion_thumbnail import DEFAULT_ALGORITHM, ALGORITHMS, generate_ion_thumbnail
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.util import bootstrap_and_run
from sm.engine.db import DB


def run(sm_config, ds_id_str, sql_where, algorithm):
    db = DB()
    img_store = ImageStoreServiceWrapper(sm_config['services']['img_service_url'])

    if sql_where:
        ds_ids = [
            id for (id,) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')
        ]
    else:
        ds_ids = ds_id_str.split(',')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'[{i+1} / {len(ds_ids)}] Generating ion thumbnail for {ds_id}')
            generate_ion_thumbnail(db, img_store, ds_id, algorithm=algorithm)
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
    args = parser.parse_args()
    logger = logging.getLogger('engine')

    if not bool(args.ds_id) ^ bool(args.sql_where):
        parser.print_usage()
        print('error: must specify either --ds-id or --sql-where')
        sys.exit(1)

    bootstrap_and_run(
        args.config,
        partial(run, ds_id=args.ds_id, sql_where=args.sql_where, algorithm=args.algorithm),
    )
