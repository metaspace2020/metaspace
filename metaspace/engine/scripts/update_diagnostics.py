import argparse
import logging
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from lithops import Storage
from lithops.storage.utils import CloudObject

from sm.engine.annotation.diagnostics import (
    DiagnosticType,
    extract_dataset_diagnostics,
    add_diagnostics,
    del_diagnostics,
)
from sm.engine.annotation.imzml_reader import LithopsImzMLReader, FSImzMLReader
from sm.engine.db import DB
from sm.engine.storage import get_s3_client
from sm.engine.util import GlobalInit, split_cos_path, split_s3_path

logger = logging.getLogger('engine')


def parse_input_path_for_lithops(sm_config, input_path):
    if input_path.startswith('s3://') or input_path.startswith('s3a://'):
        backend = 'aws_s3'
        bucket, prefix = split_s3_path(input_path)
    else:
        backend = 'ibm_cos'
        bucket, prefix = split_cos_path(input_path)

    storage = Storage(sm_config['lithops'], backend)
    if backend == 'aws_s3' and sm_config['lithops']['aws_s3']['endpoint'].startswith('http://'):
        # WORKAROUND for local Minio access
        # Lithops forces the url to HTTPS, so overwrite the S3 client with a fixed client
        # https://github.com/lithops-cloud/lithops/issues/708
        storage.storage_handler.s3_client = get_s3_client()

    keys_in_path = storage.list_keys(bucket, prefix)
    imzml_keys = [key for key in keys_in_path if key.lower().endswith('.imzml')]
    ibd_keys = [key for key in keys_in_path if key.lower().endswith('.ibd')]

    debug_info = f'Path {input_path} had keys: {keys_in_path}'
    assert len(imzml_keys) == 1, f'Couldn\'t determine imzML file. {debug_info}'
    assert len(ibd_keys) == 1, f'Couldn\'t determine ibd file. {debug_info}'

    imzml_cobject = CloudObject(storage.backend, bucket, imzml_keys[0])
    ibd_cobject = CloudObject(storage.backend, bucket, ibd_keys[0])
    return storage, imzml_cobject, ibd_cobject


def process_dataset(sm_config, del_first, ds_id):
    logger.info(f'Processing {ds_id}')
    try:
        if del_first:
            del_diagnostics(ds_id)

        ds = DB().select_one_with_fields('SELECT * FROM dataset WHERE id = %s', (ds_id,))
        input_path = ds['input_path']

        if input_path.startswith('/'):
            imzml_reader = FSImzMLReader(input_path)
            if not imzml_reader.is_mz_from_metadata or not imzml_reader.is_tic_from_metadata:
                logger.info(f'{ds_id} missing metadata, reading spectra...')
                for _ in imzml_reader.iter_spectra(np.arange(imzml_reader.n_spectra)):
                    # Read all spectra so that mz/tic data is populated
                    pass
        else:
            storage, imzml_cobject, ibd_cobject = parse_input_path_for_lithops(
                sm_config, input_path
            )
            imzml_reader = LithopsImzMLReader(
                storage,
                imzml_cobject=imzml_cobject,
                ibd_cobject=ibd_cobject,
            )

            if not imzml_reader.is_mz_from_metadata or not imzml_reader.is_tic_from_metadata:
                logger.info(f'{ds_id} missing metadata, reading spectra...')
                chunk_size = 1000
                for chunk_start in range(0, imzml_reader.n_spectra, chunk_size):
                    chunk_end = min(imzml_reader.n_spectra, chunk_start + chunk_size)
                    chunk = np.arange(chunk_start, chunk_end)
                    for _ in imzml_reader.iter_spectra(storage, chunk):
                        # Read all spectra so that mz/tic data is populated
                        pass

        diagnostics = extract_dataset_diagnostics(ds_id, imzml_reader)
        add_diagnostics(diagnostics)
        return ds_id, True
    except Exception:
        logger.error(f'Failed to process {ds_id}', exc_info=True)
        return ds_id, False


def find_dataset_ids(ds_ids_param, sql_where, missing, failed, succeeded):
    db = DB()

    if ds_ids_param:
        specified_ds_ids = ds_ids_param.split(',')
    elif sql_where:
        specified_ds_ids = db.select_onecol(f"SELECT id FROM dataset WHERE {sql_where}")
    else:
        specified_ds_ids = None
    if not missing:
        # Default to processing all datasets missing diagnostics
        missing = specified_ds_ids is None and not failed and not succeeded
    ds_type_counts = db.select(
        'SELECT d.id, COUNT(DISTINCT dd.type), COUNT(dd.error) '
        'FROM dataset d LEFT JOIN dataset_diagnostic dd on d.id = dd.ds_id '
        'WHERE d.status = \'FINISHED\' '
        'GROUP BY d.id'
    )
    if missing or failed or succeeded:
        # Get ds_ids based on status (or filter specified ds_ids on status)
        status_ds_ids = set()
        for ds_id, n_diagnostics, n_errors in ds_type_counts:
            if missing and (n_diagnostics or 0) < len(DiagnosticType):
                status_ds_ids.add(ds_id)
            elif failed and n_errors > 0:
                status_ds_ids.add(ds_id)
            elif succeeded and n_diagnostics == len(DiagnosticType) and n_errors == 0:
                status_ds_ids.add(ds_id)

        if specified_ds_ids is not None:
            # Keep order, if directly specified
            ds_ids = [ds_id for ds_id in specified_ds_ids if ds_id in status_ds_ids]
        else:
            # Order by ID descending, so that newer DSs are updated first
            ds_ids = sorted(status_ds_ids, reverse=True)
    else:
        ds_ids = specified_ds_ids
    assert ds_ids, 'No datasets found'
    return ds_ids


def run_diagnostics(sm_config, ds_ids, del_first, jobs):
    failed_ds_ids = []
    with ThreadPoolExecutor(jobs or None) as executor:
        map_func = executor.map if jobs != 1 else map
        for i, (ds_id, success) in enumerate(
            map_func(lambda ds_id: process_dataset(sm_config, del_first, ds_id), ds_ids)
        ):
            logger.info(f'Completed {ds_id} ({i}/{len(ds_ids)})')
            if not success:
                failed_ds_ids.append(ds_id)

    if failed_ds_ids:
        logger.error(f'Failed datasets ({len(failed_ds_ids)}): {failed_ds_ids}')


def main():
    parser = argparse.ArgumentParser(
        description='Reindex or update dataset results. NOTE: FDR diagnostics are unsupported as '
        'they require the dataset to be completely reprocessed.'
    )
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--ds-id', help='DS id (or comma-separated list of ids)')
    parser.add_argument('--sql-where', help='SQL WHERE clause for datasets table')
    parser.add_argument(
        '--missing',
        action='store_true',
        help='(Default if ds-id/failed/succeeded not specified) '
        'Process datasets that are missing diagnostics',
    )
    parser.add_argument(
        '--failed',
        action='store_true',
        help='Process datasets that have errors in their diagnostics',
    )
    parser.add_argument(
        '--succeeded', action='store_true', help='Process datasets even if they have diagnostics'
    )
    parser.add_argument(
        '--del-first', action='store_true', help='Delete existing diagnostics before regenerating'
    )
    parser.add_argument('--jobs', '-j', type=int, default=1, help='Number of parallel jobs to run')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    with GlobalInit(config_path=args.config) as sm_config:
        if not args.verbose:
            logging.getLogger('lithops.storage.backends').setLevel(logging.WARNING)
            warnings.filterwarnings('ignore', module='pyimzml')

        ds_ids = find_dataset_ids(
            ds_ids_param=args.ds_id,
            sql_where=args.sql_where,
            missing=args.missing,
            failed=args.failed,
            succeeded=args.succeeded,
        )
        run_diagnostics(
            sm_config=sm_config,
            ds_ids=ds_ids,
            del_first=args.del_first,
            jobs=args.jobs,
        )


if __name__ == '__main__':
    main()
