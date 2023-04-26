import argparse
import json
import logging
import sys

from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.util import GlobalInit


def get_ds_metadata(sql_where):
    db = DB()

    try:
        datasets = db.select(
            f"""
            SELECT
                dataset.id,
                dataset.metadata,
                dataset_diagnostic.data
            FROM public.dataset
            LEFT JOIN dataset_diagnostic ON dataset.id = dataset_diagnostic.ds_id
            WHERE {sql_where}
            ORDER BY dataset.id DESC
            """,
        )
        logger.info(f'Got {len(datasets)} datasets')
        return datasets

    except Exception:
        logger.error('Failed to get datasets', exc_info=True)
        return []


def make_acq_geometry(metadata, diagnostic):
    col_n = diagnostic['max_coords'][0] - diagnostic['min_coords'][0] + 1
    row_n = diagnostic['max_coords'][1] - diagnostic['min_coords'][1] + 1
    pixel_size = metadata.get('MS_Analysis', {}).get('Pixel_Size', {})
    return {
        'length_unit': 'nm',
        'pixel_count': diagnostic['n_spectra'],
        'acquisition_grid': {'regular_grid': True, 'count_x': int(col_n), 'count_y': int(row_n)},
        'pixel_size': {
            'regular_size': True,
            'size_x': pixel_size.get('Xaxis'),
            'size_y': pixel_size.get('Yaxis'),
        },
    }


def update_acq_geometry(ds_id, acq_geometry):
    db = DB()

    try:
        db.alter(
            'UPDATE public.dataset SET acq_geometry=%s WHERE id=%s',
            params=(
                json.dumps(acq_geometry),
                ds_id,
            ),
        )
        logger.info(f'Updated acq_geometry for {ds_id}')
    except Exception:
        logger.error(f'Failed to update acq_geometry for {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update size and hash sum for a provided datasets')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "id = \'2023-01-01_09h51m24s\' AND status = \'FINISHED\' "',
    )

    args = parser.parse_args()
    logger = logging.getLogger('engine')

    sm_config = SMConfig.get_conf()

    if args.sql_where:
        with GlobalInit(args.config_path):
            ds_metadata = get_ds_metadata(args.sql_where)
            if not ds_metadata:
                logger.info('No datasets found')
                sys.exit(0)

            for ds in ds_metadata:
                ds_id, ds_metadata, ds_diagnostic = ds
                acq_geometry = make_acq_geometry(ds_metadata, ds_diagnostic)
                update_acq_geometry(ds_id, acq_geometry)
