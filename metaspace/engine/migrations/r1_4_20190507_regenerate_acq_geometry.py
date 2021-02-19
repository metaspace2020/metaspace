import argparse
import logging

from sm.engine.annotation.acq_geometry import make_acq_geometry
from sm.engine.dataset import Dataset
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.config import init_loggers, SMConfig
from sm.engine.db import DB


MIGRATION_SQL_WHERE = "status != 'FAILED' ORDER BY id DESC"


def run(ds_id, sql_where):

    conf = SMConfig.get_conf()

    db = DB(conf['db'])
    img_store = ImageStoreServiceWrapper(conf['services']['img_service_url'])

    if sql_where:
        ds_ids = [
            id for (id,) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')
        ]
    else:
        ds_ids = ds_id.split(',')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'[{i+1} / {len(ds_ids)}] Updating acq geometry for {ds_id}')
            ds = Dataset.load(db, ds_id)
            (sample_img_id,) = db.select_one(
                "SELECT iim.iso_image_ids[1] from job j "
                "JOIN iso_image_metrics iim on j.id = iim.job_id "
                "WHERE j.ds_id = %s LIMIT 1",
                [ds_id],
            )
            print(sample_img_id)
            if sample_img_id:
                w, h = img_store.get_image_by_id('fs', 'iso_image', sample_img_id).size
                dims = (h, w)  # n_cols, n_rows
            else:
                dims = (None, None)

            acq_geometry = make_acq_geometry('ims', None, ds.metadata, dims)

            ds.save_acq_geometry(db, acq_geometry)

        except Exception:
            logger.error(f'Failed on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run colocalization jobs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--ds-id', default=None, help='DS id (or comma-separated list of ids)')
    parser.add_argument(
        '--sql-where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "status = \'FINISHED\' and ion_thumbnail is null"',
    )
    parser.add_argument('--migrate', action='store_true', help='Update all datasets')
    args = parser.parse_args()

    if not (bool(args.ds_id) ^ bool(args.sql_where) ^ bool(args.migrate)):
        parser.print_usage()
        print('error: must specify --ds-id, --sql-where or --migrate')
        exit(1)

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    run(args.ds_id, MIGRATION_SQL_WHERE if args.migrate else args.sql_where)
