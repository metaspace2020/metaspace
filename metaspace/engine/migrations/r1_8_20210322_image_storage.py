import argparse
import logging
import time
import contextlib
import traceback
from concurrent.futures.process import ProcessPoolExecutor
from multiprocessing import Lock
from pathlib import Path

import boto3
import botocore
import boto3.s3.transfer as s3transfer

from sm.engine import image_storage
from sm.engine.dataset import DatasetStatus
from sm.engine.db import DB, ConnectionPool
from sm.engine.es_export import ESExporter
from sm.engine.util import on_startup


class Output:
    def __init__(self):
        self.lines = []

    def print(self, line=''):
        self.lines.append(str(line))

    def flush(self):
        result = '\n'.join(self.lines) + '\n'
        self.lines = []
        return result


@contextlib.contextmanager
def timeit(msg=''):
    start = time.time()
    yield
    output.print(f'{msg} elapsed: {time.time() - start:.2f}s')


def create_s3_client():
    boto_config = botocore.config.Config(signature_version='s3v4', max_pool_connections=20)
    if 'aws' in sm_config:
        kwargs = dict(
            region_name=sm_config['aws']['aws_default_region'],
            aws_access_key_id=sm_config['aws']['aws_access_key_id'],
            aws_secret_access_key=sm_config['aws']['aws_secret_access_key'],
        )
    else:
        kwargs = dict(
            endpoint_url=sm_config['storage']['endpoint_url'],
            aws_access_key_id=sm_config['storage']['access_key_id'],
            aws_secret_access_key=sm_config['storage']['secret_access_key'],
        )
    return boto3.client('s3', config=boto_config, **kwargs)


def create_s3t():
    s3_client = create_s3_client()
    transfer_config = s3transfer.TransferConfig(
        use_threads=True, max_concurrency=s3_client.meta.config.max_pool_connections
    )
    return s3transfer.create_transfer_manager(s3_client, config=transfer_config)


def transfer_images(
    ds_id,
    old_image_type,
    image_type,
    image_ids,
):
    s3t = create_s3t()
    futures = []
    for image_id in image_ids:
        if image_id:
            image_path = Path(image_base_path) / old_image_type / image_id[:3] / image_id[3:]
            image_key = f'{image_type}/{ds_id}/{image_id}'
            fut = s3t.upload(fileobj=str(image_path), bucket=bucket_name, key=image_key)
            futures.append(fut)
    s3t.shutdown()
    [fut.result() for fut in futures]


SEL_DS_IMG_IDS = '''
    SELECT img_id
    FROM (
        SELECT unnest(a.iso_image_ids) as img_id
        FROM dataset d
        JOIN job j on d.id = j.ds_id
        JOIN annotation a on j.id = a.job_id
        WHERE d.id = %s
    ) t
    WHERE t.img_id IS NOT NULL
'''


def _es_docs_migrated(es, ds_id):
    query_body = {'query': {'match': {'ds_id': ds_id}}}
    resp = es.search(
        index='sm',
        doc_type='annotation',
        body=query_body,
        _source=['iso_image_urls'],
        size=1,
    )
    hits = resp['hits']['hits']
    return hits and 'iso_image_urls' in hits[0]['_source']


def migrate_isotopic_images(ds_id):
    output.print('Migrating isotopic images')

    db = DB()
    image_ids = db.select_onecol(SEL_DS_IMG_IDS, params=(ds_id,))
    es_exporter = ESExporter(db, sm_config)
    if image_ids and not _es_docs_migrated(es_exporter._es, ds_id):

        with timeit():
            output.print('Transferring images...')
            output.print(len(image_ids))
            transfer_images(ds_id, 'iso_images', image_storage.ISO, image_ids)

        with timeit():
            output.print('Reindexing ES documents...')
            es_exporter.reindex_ds(ds_id)


SEL_ION_THUMB = '''
    SELECT ion_thumbnail, ion_thumbnail_url
    FROM dataset
    WHERE id = %s;
'''
UPD_ION_THUMB = '''
    UPDATE dataset
    SET ion_thumbnail_url = %s
    WHERE id = %s
'''


def migrate_ion_thumbnail(ds_id):
    output.print('Migrating ion thumbnail images')

    with timeit():
        output.print('Transferring images and updating database...')
        db = DB()
        ion_thumb_id, ion_thumbnail_url = db.select_one(SEL_ION_THUMB, params=(ds_id,))
        if not ion_thumbnail_url and ion_thumb_id:
            transfer_images(
                ds_id,
                'ion_thumbnails',
                image_storage.THUMB,
                [ion_thumb_id],
            )
            ion_thumb_url = image_storage.get_image_url(image_storage.THUMB, ds_id, ion_thumb_id)
            db.alter(UPD_ION_THUMB, params=(ion_thumb_url, ds_id))


SEL_OPTICAL_IMGS = '''
    SELECT id, url
    FROM optical_image
    WHERE ds_id = %s
'''
UPD_OPTICAL_IMGS = '''
    UPDATE optical_image
    SET url = %s
    WHERE id = %s
'''
SEL_OPT_THUMB = '''
    SELECT thumbnail, thumbnail_url
    FROM dataset
    WHERE id = %s;
'''
UPD_OPT_THUMB = '''
    UPDATE dataset
    SET thumbnail_url = %s
    WHERE id = %s
'''


def migrate_optical_images(ds_id):
    output.print('Migrating optical images')

    with timeit():
        output.print('Transferring images and updating database...')
        db = DB()
        rows = db.select(SEL_OPTICAL_IMGS, params=(ds_id,))
        for opt_image_id, opt_image_url in rows:
            if not opt_image_url and opt_image_id:
                transfer_images(
                    ds_id,
                    'optical_images',
                    image_storage.OPTICAL,
                    [opt_image_id],
                )
                opt_image_url = image_storage.get_image_url(
                    image_storage.OPTICAL, ds_id, opt_image_id
                )
                db.alter(UPD_OPTICAL_IMGS, params=(opt_image_url, opt_image_id))

        opt_thumb_id, opt_thumb_url = db.select_one(SEL_OPT_THUMB, params=(ds_id,))
        if not opt_thumb_url and opt_thumb_id:
            transfer_images(
                ds_id,
                'optical_images',
                image_storage.OPTICAL,
                [opt_thumb_id],
            )
            opt_thumb_url = image_storage.get_image_url(image_storage.OPTICAL, ds_id, opt_thumb_id)
            db.alter(UPD_OPT_THUMB, params=(opt_thumb_url, ds_id))


SEL_ALL_DSS = '''
    SELECT d.id, d.status, d.upload_dt
    FROM dataset d
    WHERE status != 'FAILED'
    ORDER BY upload_dt DESC
'''
SEL_SPEC_DSS = '''
    SELECT d.id
    FROM dataset d
    WHERE d.id = ANY(%s)
'''


def read_ds_list(path):
    result = set()
    if Path(path).exists():
        with open(path) as f:
            result = {ds_id for ds_id in f.read().split(',') if ds_id}
    return result


def migrate_dataset(ds, i, n, force=False):
    output.print(f'Migrating dataset {ds["id"]} ({i}/{n})')

    with ConnectionPool(sm_config['db']):
        try:
            with timeit('Dataset'):
                if force or ds['status'] == DatasetStatus.FINISHED:
                    migrate_isotopic_images(ds['id'])
                    migrate_ion_thumbnail(ds['id'])

                migrate_optical_images(ds['id'])
        except Exception:
            output.print(f'Migration of {ds["id"]} failed:\n{traceback.format_exc()}')
            lock.acquire()
            with open('FAILED_DATASETS.txt', 'a') as f:
                f.write(',' + ds['id'])
            lock.release()
        else:
            lock.acquire()
            with open('SUCCEEDED_DATASETS.txt', 'a') as f:
                f.write(',' + ds['id'])
            lock.release()

    return output.flush()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrate image storage data')
    parser.add_argument('--config', default='conf/config.json')
    parser.add_argument('--image-base-path')
    parser.add_argument(
        '--ds-ids', dest='ds_ids', default=None, help='DS id (or comma-separated list of ids)'
    )
    args = parser.parse_args()

    image_base_path = args.image_base_path

    sm_config = on_startup(args.config)
    bucket_name = sm_config['image_storage']['bucket']

    logging.getLogger('engine').setLevel(logging.WARNING)
    logging.getLogger('engine.db').setLevel(logging.WARNING)
    output = Output()

    lock = Lock()

    if args.ds_ids:
        ds_ids = list({ds_id for ds_id in args.ds_ids.split(',') if ds_id})
        with ConnectionPool(sm_config['db']):
            dss_to_process = DB().select_with_fields(SEL_SPEC_DSS, params=(ds_ids,))
        n = len(dss_to_process)
        for i, ds in enumerate(dss_to_process, 1):
            logs = migrate_dataset(ds, i, n, force=True)
            print(logs)
    else:
        with ConnectionPool(sm_config['db']):
            dss = DB().select_with_fields(SEL_ALL_DSS)
        processed_ds_ids = read_ds_list('SUCCEEDED_DATASETS.txt') | read_ds_list(
            'FAILED_DATASETS.txt'
        )
        dss_to_process = [ds for ds in dss if ds['id'] not in processed_ds_ids]

        n = len(dss_to_process)
        tasks = [(ds, i, n) for i, ds in enumerate(dss_to_process, 1)]
        with ProcessPoolExecutor(max_workers=4) as executor:
            for logs in executor.map(migrate_dataset, *zip(*tasks)):
                print(logs)
