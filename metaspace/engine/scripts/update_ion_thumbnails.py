import argparse
import logging

from sm.engine.ion_thumbnail import DEFAULT_ALGORITHM, ALGORITHMS, generate_ion_thumbnail
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB


def run(ds_id, sql_where, algorithm):

    conf = SMConfig.get_conf()

    db = DB(conf['db'])
    img_store = ImageStoreServiceWrapper(conf['services']['img_service_url'])

    if sql_where:
        ds_ids = [id for (id, ) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')]
    else:
        ds_ids = ds_id.split(',')

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
    parser.add_argument('--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)')
    parser.add_argument('--sql-where', dest='sql_where', default=None,
                        help='SQL WHERE clause for picking rows from the dataset table, '
                             'e.g. "status = \'FINISHED\' and ion_thumbnail is null"')
    parser.add_argument('--algorithm', dest='algorithm', default=DEFAULT_ALGORITHM,
                        help='Algorithm for thumbnail generation. Options: ' + str(list(ALGORITHMS.keys())))
    args = parser.parse_args()

    if not (args.ds_id or args.sql_where) or (args.ds_id and args.sql_where):
        parser.print_usage()
        print('error: must specify either --ds-id or --sql-where')
        exit(1)

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    run(args.ds_id, args.sql_where, args.algorithm)
