from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures.thread import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Dict, List, Union

import boto3
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import StorageNoSuchKeyError, CloudObject

from sm.engine import molecular_db
from sm.engine.annotation.formula_validator import METRICS
from sm.engine.annotation.job import del_jobs, insert_running_job, update_finished_job, JobStatus
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.annotation_lithops.pipeline import Pipeline
from sm.engine.annotation_lithops.utils import jsonhash
from sm.engine.annotation_spark.search_results import SearchResults
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.ds_config import DSConfig
from sm.engine.es_export import ESExporter
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.molecular_db import read_moldb_file
from sm.engine.util import SMConfig, split_s3_path, split_cos_path
from sm.engine.utils.perf_profile import Profiler

logger = logging.getLogger('engine')


def _choose_cos_location(src_path, sm_storage, storage_type):
    """Maps the provided COS/S3/local filesystem path to an appropriate bucket & key in COS"""
    bucket, prefix = sm_storage[storage_type]
    src_path = str(src_path)
    if src_path.startswith('cos://'):
        # Already in COS - no need to translate path
        return split_cos_path(src_path)

    if src_path.startswith('s3a://'):
        # Ignore the bucket and take the key
        _, suffix = split_s3_path(src_path)
    else:
        # Ignore the directory and take the filename
        suffix = Path(src_path).name

    key = f'{prefix}/{suffix}' if prefix else suffix
    return bucket, key


def _upload_if_needed(src_path, storage, sm_storage, storage_type, s3_client=None):
    """
    Uploads the object from `src_path` if it doesn't already exist in its translated COS path.
    Returns a CloudObject for the COS object
    """
    bucket, key = _choose_cos_location(src_path, sm_storage, storage_type)

    try:
        storage.head_object(bucket, key)
        logger.debug(f'{src_path} already uploaded')
        return CloudObject(storage.backend, bucket, key)
    except StorageNoSuchKeyError:
        logger.info(f'Uploading {src_path}...')
        if src_path.startswith('s3a://'):
            assert s3_client, 'S3 client must be supplied to support s3a:// paths'
            src_bucket, src_key = split_s3_path(src_path)

            obj = s3_client.get_object(Bucket=src_bucket, Key=src_key)
            if hasattr(storage.get_client(), 'upload_fileobj'):
                # Try streaming upload to IBM COS
                storage.get_client().upload_fileobj(Fileobj=obj['Body'], Bucket=bucket, Key=key)
                cobject = CloudObject(storage.backend, bucket, key)
            else:
                # Fall back to buffering the entire object in memory for other backends
                cobject = storage.put_cobject(obj['Body'].read(), bucket, key)
        else:
            cobject = storage.put_cobject(open(src_path, 'rb'), bucket, key)
        logger.info(f'Uploading {src_path}...Done')
        return cobject


def _upload_imzmls_from_prefix_if_needed(src_path, storage, sm_storage, s3_client=None):
    if src_path.startswith('cos://'):
        bucket, prefix = src_path[len('cos://') :].split('/', maxsplit=1)
        keys = [f'cos://{bucket}/{key}' for key in storage.list_keys(bucket, prefix)]
    elif src_path.startswith('s3a://'):
        bucket, prefix = split_s3_path(src_path)
        response = s3_client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        if 'Contents' in response:
            keys = [f"s3a://{bucket}/{item['Key']}" for item in response['Contents']]
        else:
            keys = []
    else:
        keys = [str(p) for p in Path(src_path).iterdir()]

    imzml_keys = [key for key in keys if key.lower().endswith('.imzml')]
    ibd_keys = [key for key in keys if key.lower().endswith('.ibd')]
    assert len(imzml_keys) == 1, imzml_keys
    assert len(ibd_keys) == 1, ibd_keys
    imzml_cobj = _upload_if_needed(imzml_keys[0], storage, sm_storage, 'imzml', s3_client)
    ibd_cobj = _upload_if_needed(ibd_keys[0], storage, sm_storage, 'imzml', s3_client)

    return imzml_cobj, ibd_cobj


def _upload_moldbs_from_db(moldb_ids, storage, sm_storage):
    moldb_defs = []
    bucket, prefix = sm_storage['moldb']
    # Sort the moldbs because the centroids cache key is affected by their order
    for moldb_id in sorted(moldb_ids):
        key = f'{prefix}/{moldb_id}'
        try:
            storage.head_object(bucket, key)
            logger.debug(f'Found mol db at {key}')
            # This cast doesn't include the generic argument due to
            # https://youtrack.jetbrains.com/issue/PY-43838 (Fix coming in PyCharm 2020.2.3)
            cobject = CloudObject(storage.backend, bucket, key)
        except StorageNoSuchKeyError:
            logger.info(f'Uploading {key}...')
            mols_query = DB().select(
                'SELECT DISTINCT formula FROM molecule WHERE moldb_id = %s', (moldb_id,)
            )
            mols = [mol for mol, in mols_query]
            cobject = save_cobj(storage, mols, bucket=bucket, key=key)
            logger.info(f'Uploading {key}...Done')
        (targeted,) = DB().select_one(
            'SELECT targeted FROM molecular_db WHERE id = %s', (moldb_id,)
        )
        moldb_defs.append({'id': moldb_id, 'cobj': cobject, 'targeted': targeted})

    return moldb_defs


def _upload_moldbs_from_files(file_paths, storage, sm_storage):
    moldb_defs = []
    for file_path in file_paths:
        bucket, raw_key = _choose_cos_location(file_path, sm_storage, 'moldb')
        key = raw_key + '_formulas'
        try:
            storage.head_object(bucket, key)
            logger.debug(f'Found mol db at {key}')
            cobject = CloudObject(storage.backend, bucket, key)
        except StorageNoSuchKeyError:
            logger.info(f'Uploading {key}...')
            mols = read_moldb_file(file_path).formula
            cobject = save_cobj(storage, mols, bucket=bucket, key=key)
            logger.info(f'Uploading {key}...Done')
        moldb_defs.append({'id': Path(file_path).stem, 'cobj': cobject, 'targeted': False})

    return moldb_defs


class LocalAnnotationJob:
    """
    Runs an annotation job from local files and saves the results to the filesystem.

    As a developer convienence, if a list of integers is given for `moldb_files`,
    then it will try to connect to the configured postgres database and dump the formulas
    for the specified databases.
    Otherwise, this can be used to run the pipeline without any external dependencies.
    """

    def __init__(
        self,
        imzml_file: str,
        ibd_file: str,
        moldb_files: Union[List[int], List[str]],
        ds_config: DSConfig,
        sm_config: Optional[Dict] = None,
        use_cache=True,
    ):
        sm_config = sm_config or SMConfig.get_conf()
        self.storage = Storage(
            lithops_config=sm_config['lithops'],
            storage_backend=sm_config['lithops']['lithops']['storage_backend'],
        )
        sm_storage = sm_config['lithops']['sm_storage']

        self.imzml_cobj = _upload_if_needed(imzml_file, self.storage, sm_storage, 'imzml')
        self.ibd_cobj = _upload_if_needed(ibd_file, self.storage, sm_storage, 'imzml')
        if isinstance(moldb_files[0], int):
            self.moldb_defs = _upload_moldbs_from_db(moldb_files, self.storage, sm_storage)
        else:
            self.moldb_defs = _upload_moldbs_from_db(moldb_files, self.storage, sm_storage)
        self.ds_config = ds_config

        if use_cache:
            cache_key: Optional[str] = jsonhash(
                {'imzml': imzml_file, 'ibd': ibd_file, 'dbs': moldb_files, 'ds': ds_config}
            )
        else:
            cache_key = None

        self.pipe = Pipeline(
            self.imzml_cobj, self.ibd_cobj, self.moldb_defs, self.ds_config, cache_key=cache_key
        )

    def run(self, save=True, **kwargs):
        results_dfs, png_cobjs = self.pipe(**kwargs)
        if save:
            for moldb_id, results_df in results_dfs.items():
                results_df.to_csv(f'./results_{moldb_id}.csv')
            all_results = pd.concat(list(results_dfs.values()))
            all_results = all_results[~all_results.index.duplicated()]
            image_names = (
                all_results.formula
                + all_results.chem_mod.fillna('')
                + all_results.neutral_loss.fillna('')
                + all_results.adduct
            )
            out_dir = Path('./result_pngs')
            out_dir.mkdir(exist_ok=True)
            for imageset in iter_cobjs_with_prefetch(self.storage, png_cobjs):
                for formula_i, imgs in imageset:
                    for i, img in enumerate(imgs, 1):
                        if img:
                            (out_dir / f'{image_names[formula_i]}_{i}.png').open('wb').write(img)


class ServerAnnotationJob:
    """
    Runs an annotation job for a dataset in the database, saving the results back to the database
    and image store.
    """

    def __init__(
        self,
        executor: Executor,
        img_store: ImageStoreServiceWrapper,
        ds: Dataset,
        perf: Profiler,
        sm_config: Optional[Dict] = None,
        use_cache=False,
    ):
        """
        Args
        ========

        use_cache: For development - cache the results after each pipeline step so that it's easier
                   to quickly re-run specific steps.
        """
        sm_config = sm_config or SMConfig.get_conf()
        self.sm_storage = sm_config['lithops']['sm_storage']
        self.storage = Storage(
            lithops_config=sm_config['lithops'],
            storage_backend=sm_config['lithops']['lithops']['storage_backend'],
        )
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=sm_config['aws']['aws_access_key_id'],
            aws_secret_access_key=sm_config['aws']['aws_secret_access_key'],
        )
        self.ds = ds
        self.perf = perf
        self.img_store = img_store
        self.db = DB()
        self.es = ESExporter(self.db, sm_config)
        self.imzml_cobj, self.ibd_cobj = _upload_imzmls_from_prefix_if_needed(
            self.ds.input_path, self.storage, self.sm_storage, self.s3_client
        )
        self.moldb_defs = _upload_moldbs_from_db(
            self.ds.config['database_ids'], self.storage, self.sm_storage
        )

        if use_cache:
            cache_key: Optional[str] = jsonhash({'input_path': ds.input_path, 'ds': ds.config})
        else:
            cache_key = None

        self.pipe = Pipeline(
            self.imzml_cobj,
            self.ibd_cobj,
            self.moldb_defs,
            self.ds.config,
            cache_key=cache_key,
            executor=executor,
        )

        self.results_dfs = None
        self.png_cobjs = None
        self.db_formula_image_ids = None

    def _store_images(self, all_results_dfs, formula_png_iter):
        db_formula_image_ids = defaultdict(dict)
        img_store_type = self.ds.get_ion_img_storage_type(self.db)

        def _upload_images(formula_id, db_id, pngs):
            image_ids = [
                self.img_store.post_image(img_store_type, 'iso_image', png)
                if png is not None
                else None
                for png in pngs
            ]
            db_formula_image_ids[db_id][formula_id] = {'iso_image_ids': image_ids}

        with ThreadPoolExecutor(2) as executor:
            for formula_png_chunk in formula_png_iter:
                # Join results_df so that each formula_i is associated with one or more
                # moldb_ids
                tasks = (
                    pd.DataFrame(formula_png_chunk, columns=['formula_i', 'pngs'])
                    .set_index('formula_i')
                    .join(all_results_dfs)[['moldb_id', 'pngs']]
                    .itertuples(True, None)
                )
                list(executor.map(_upload_images, *zip(*tasks)))

        return db_formula_image_ids

    def run(self, **kwargs):
        isocalc = IsocalcWrapper(self.ds.config)
        # TODO: Only run missing moldbs
        del_jobs(self.ds)
        moldb_to_job_map = {}
        for moldb_id in self.ds.config['database_ids']:
            moldb_to_job_map[moldb_id] = insert_running_job(self.ds.id, moldb_id)
        self.perf.add_extra_data(moldb_ids=list(moldb_to_job_map.keys()))

        try:
            self.results_dfs, self.png_cobjs = self.pipe(**kwargs)
            self.db_formula_image_ids = self._store_images(
                pd.concat(list(self.results_dfs.values())),
                iter_cobjs_with_prefetch(self.storage, self.png_cobjs),
            )

            for moldb_id, job_id in moldb_to_job_map.items():
                results_df = self.results_dfs[moldb_id]
                formula_image_ids = self.db_formula_image_ids.get(moldb_id, {})

                search_results = SearchResults(
                    job_id=job_id,
                    metric_names=METRICS.keys(),
                    n_peaks=self.ds.config['isotope_generation']['n_peaks'],
                    charge=self.ds.config['isotope_generation']['charge'],
                )
                search_results.store_ion_metrics(results_df, formula_image_ids, self.db)

                update_finished_job(job_id, JobStatus.FINISHED)
                self.es.index_ds(self.ds.id, molecular_db.find_by_id(moldb_id), isocalc)
        except Exception:
            for moldb_id, job_id in moldb_to_job_map.items():
                update_finished_job(job_id, JobStatus.FAILED)
            raise
