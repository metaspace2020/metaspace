from __future__ import annotations

import logging
from contextlib import ExitStack
from pathlib import Path
from typing import Optional, Dict, List, Union

import pandas as pd
from ibm_boto3.s3.transfer import TransferConfig, MB
from lithops.storage import Storage
from lithops.storage.utils import StorageNoSuchKeyError, CloudObject

from sm.engine import molecular_db
from sm.engine.annotation.diagnostics import (
    extract_dataset_diagnostics,
    add_diagnostics,
    extract_job_diagnostics,
)
from sm.engine.annotation.enrichment import add_enrichment, delete_ds_enrichments
from sm.engine.annotation.job import del_jobs, insert_running_job, update_finished_job, JobStatus
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.annotation_lithops.pipeline import Pipeline
from sm.engine.annotation_lithops.utils import jsonhash
from sm.engine.annotation_spark.search_results import SearchResults
from sm.engine.config import SMConfig
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.ds_config import DSConfig
from sm.engine.es_export import ESExporter
from sm.engine.molecular_db import read_moldb_file
from sm.engine.storage import get_s3_client
from sm.engine.util import split_s3_path, split_cos_path
from sm.engine.utils.db_mutex import DBMutex
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


def _upload_if_needed(
    src_path, storage, sm_storage, storage_type, s3_client=None, use_db_mutex=True
):
    """
    Uploads the object from `src_path` if it doesn't already exist in its translated COS path.
    Returns a CloudObject for the COS object
    """
    bucket, key = _choose_cos_location(src_path, sm_storage, storage_type)

    with ExitStack() as stack:
        if use_db_mutex:
            # Lock during upload to prevent parallel jobs upload the same file simultaneously
            stack.enter_context(DBMutex().lock(bucket + key, timeout=1200))

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
                    transfer_config = TransferConfig(
                        multipart_chunksize=20 * MB, max_concurrency=20, io_chunksize=1 * MB
                    )
                    storage.get_client().upload_fileobj(
                        Fileobj=obj['Body'], Bucket=bucket, Key=key, Config=transfer_config
                    )
                    cobject = CloudObject(storage.backend, bucket, key)
                else:
                    # Fall back to buffering the entire object in memory for other backends
                    cobject = storage.put_cloudobject(obj['Body'].read(), bucket, key)
            else:
                cobject = storage.put_cloudobject(open(src_path, 'rb'), bucket, key)
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
        try:
            molecular_db.find_by_id(moldb_id)
        except Exception:  # db does not exist, continue to next
            continue

        key = f'{prefix}/{moldb_id}'
        try:
            storage.head_object(bucket, key)
            logger.debug(f'Found mol db at {key}')
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

    As a developer convenience, if a list of integers is given for `moldb_files`,
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
        out_dir: Optional[str] = None,
        executor: Optional[Executor] = None,
    ):
        sm_config = sm_config or SMConfig.get_conf()
        self.storage = Storage(config=sm_config['lithops'])
        sm_storage = sm_config['lithops']['sm_storage']

        self.imzml_cobj = _upload_if_needed(
            imzml_file, self.storage, sm_storage, 'imzml', use_db_mutex=False
        )
        self.ibd_cobj = _upload_if_needed(
            ibd_file, self.storage, sm_storage, 'imzml', use_db_mutex=False
        )
        if isinstance(moldb_files[0], int):
            self.moldb_defs = _upload_moldbs_from_db(moldb_files, self.storage, sm_storage)
        else:
            self.moldb_defs = _upload_moldbs_from_files(moldb_files, self.storage, sm_storage)
        self.ds_config = ds_config
        self.out_dir = Path(out_dir) if out_dir else Path('./result_pngs')

        if use_cache:
            cache_key: Optional[str] = jsonhash(
                {'imzml': imzml_file, 'ibd': ibd_file, 'dbs': moldb_files, 'ds': ds_config}
            )
        else:
            cache_key = None

        self.pipe = Pipeline(
            self.imzml_cobj,
            self.ibd_cobj,
            self.moldb_defs,
            self.ds_config,
            executor=executor,
            cache_key=cache_key,
            use_db_cache=use_cache,
            use_db_mutex=False,
            lithops_config=sm_config['lithops'],
        )

    def run(self, save=True, **kwargs):
        results_dfs, png_cobjs, _ = self.pipe.run_pipeline(**kwargs)

        if save:
            for moldb_id, results_df in results_dfs.items():
                results_df.to_csv(self.out_dir / f'results_{moldb_id}.csv')
            all_results = pd.concat(list(results_dfs.values()))
            all_results = all_results[~all_results.index.duplicated()]
            image_names = (
                all_results.formula
                + all_results.chem_mod.fillna('')
                + all_results.neutral_loss.fillna('')
                + all_results.adduct
            )

            self.out_dir.mkdir(exist_ok=True)
            for imageset in iter_cobjs_with_prefetch(self.storage, png_cobjs):
                for formula_i, imgs in imageset:
                    for i, img in enumerate(imgs, 1):
                        if img:
                            out_file = self.out_dir / f'{image_names[formula_i]}_{i}.png'
                            out_file.open('wb').write(img)


# pylint: disable=too-many-instance-attributes
class ServerAnnotationJob:
    """
    Runs an annotation job for a dataset in the database, saving the results back to the database
    and image storage.
    """

    def __init__(
        self,
        executor: Executor,
        ds: Dataset,
        perf: Profiler,
        sm_config: Optional[Dict] = None,
        use_cache=False,
        store_images=True,
        perform_enrichment: bool = False,
    ):
        """
        Args
        ========

        use_cache: For development - cache the results after each pipeline step so that it's easier
                   to quickly re-run specific steps.
        """
        sm_config = sm_config or SMConfig.get_conf()
        self.sm_storage = sm_config['lithops']['sm_storage']
        self.storage = Storage(sm_config['lithops'])
        self.s3_client = get_s3_client()
        self.ds = ds
        self.perf = perf
        self.store_images = store_images
        self.perform_enrichment = perform_enrichment
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
            ds_id=self.ds.id,
        )

        self.results_dfs = None
        self.png_cobjs = None
        self.db_formula_image_ids = None
        self.enrichment_data = None
        self.ds_size_hash = None

    def run(self, **kwargs):
        # TODO: Only run missing moldbs
        del_jobs(self.ds)
        moldb_to_job_map = {}
        moldb_to_be_removed = []

        for moldb_id in self.ds.config['database_ids']:
            try:
                molecular_db.find_by_id(moldb_id)
                moldb_to_job_map[moldb_id] = insert_running_job(self.ds.id, moldb_id)
            except Exception:  # db does not exist, continue to next
                moldb_to_be_removed.append(moldb_id)
                logger.warning(f'Removed db {moldb_id} from {self.ds.id}')
                continue

        if len(moldb_to_be_removed) > 0:  # remove non-existing moldbs from ds
            self.ds.config['database_ids'] = [
                x for x in self.ds.config['database_ids'] if x not in moldb_to_be_removed
            ]
            self.ds.save(self.db)

        self.perf.add_extra_data(moldb_ids=list(moldb_to_job_map.keys()))

        n_peaks = self.ds.config['isotope_generation']['n_peaks']

        try:
            # Run annotation
            self.results_dfs, self.png_cobjs, self.enrichment_data = self.pipe.run_pipeline(
                perform_enrichment=self.perform_enrichment, **kwargs
            )

            # Save acq_geometry
            self.pipe.save_acq_geometry(self.ds)

            # Save size and hash of imzML/ibd files
            self.pipe.store_ds_size_hash()

            # Save images (if enabled)
            if self.store_images:
                self.db_formula_image_ids = self.pipe.store_images_to_s3(self.ds.id)
            else:
                self.db_formula_image_ids = {
                    moldb_id: {formula_i: [None] * n_peaks for formula_i in result_df.index}
                    for moldb_id, result_df in self.results_dfs.items()
                }

            fdr_bundles = self.pipe.get_fdr_bundles(moldb_to_job_map)

            # Save non-job-related diagnostics
            diagnostics = extract_dataset_diagnostics(self.ds.id, self.pipe.imzml_reader)
            add_diagnostics(diagnostics)

            # delete pre calculated enrichments if already exists
            delete_ds_enrichments(self.ds.id, self.db)

            for moldb_id, job_id in moldb_to_job_map.items():
                logger.debug(f'Storing results for moldb {moldb_id}')
                results_df = self.results_dfs[moldb_id]

                formula_image_ids = self.db_formula_image_ids.get(moldb_id, {})

                search_results = SearchResults(
                    ds_id=self.ds.id,
                    job_id=job_id,
                    n_peaks=n_peaks,
                    charge=self.ds.config['isotope_generation']['charge'],
                )
                search_results.store_ion_metrics(results_df, formula_image_ids, self.db)

                add_diagnostics(extract_job_diagnostics(self.ds.id, job_id, fdr_bundles[job_id]))

                if (
                    self.perform_enrichment
                    and self.enrichment_data
                    and moldb_id in self.enrichment_data.keys()
                    and not self.enrichment_data[moldb_id].empty
                ):
                    # get annotations ids to be used later on to speed up enrichment routes
                    annot_ids = search_results.get_annotations_ids(self.db)
                    bootstrap_df = self.enrichment_data[moldb_id]
                    add_enrichment(self.ds.id, moldb_id, bootstrap_df, annot_ids, self.db)

                update_finished_job(job_id, JobStatus.FINISHED)
        except Exception:
            for moldb_id, job_id in moldb_to_job_map.items():
                update_finished_job(job_id, JobStatus.FAILED)
            raise
