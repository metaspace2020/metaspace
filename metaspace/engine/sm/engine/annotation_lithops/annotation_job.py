from __future__ import annotations
import logging
from collections import defaultdict
from concurrent.futures.thread import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Dict, List
from lithops.storage import Storage
from lithops.storage.utils import StorageNoSuchKeyError, CloudObject
import pandas as pd

from sm.engine import molecular_db
from sm.engine.annotation.formula_validator import METRICS
from sm.engine.annotation.job import del_jobs, insert_running_job, update_finished_job, JobStatus
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.annotation_lithops.pipeline import Pipeline
from sm.engine.annotation_lithops.utils import jsonhash
from sm.engine.dataset import Dataset
from sm.engine.ds_config import DSConfig
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.annotation_spark.search_results import SearchResults
from sm.engine.util import SMConfig

logger = logging.getLogger('engine')


def _upload_if_not_exists(local_path, storage, sm_storage, storage_type):
    local_path = Path(local_path)

    bucket, prefix = sm_storage[storage_type]
    key = f'{prefix}/{local_path.name}'
    try:
        storage.head_object(bucket, key)
        logger.debug(f'{local_path.name} already uploaded')
        return CloudObject(storage.backend, bucket, key)
    except StorageNoSuchKeyError:
        logger.info(f'Uploading {local_path.name}...')
        cobject = storage.put_cobject(open(local_path, 'rb'), bucket, key)
        logger.info(f'Uploading {local_path.name}...Done')
        return cobject


def _upload_moldb_cobjects(moldb_ids, storage, sm_storage):
    cobjs = []
    bucket, prefix = sm_storage['moldb']
    for moldb_id in moldb_ids:
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
        cobjs.append(cobject)

    return cobjs


class LocalAnnotationJob:
    def __init__(
        self,
        imzml_file: str,
        ibd_file: str,
        moldb_ids: List[int],
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

        self.imzml_cobj = _upload_if_not_exists(imzml_file, self.storage, sm_storage, 'imzml')
        self.ibd_cobj = _upload_if_not_exists(ibd_file, self.storage, sm_storage, 'imzml')
        self.moldb_cobjs = _upload_moldb_cobjects(moldb_ids, self.storage, sm_storage)
        self.ds_config = ds_config

        if use_cache:
            cache_key: Optional[str] = jsonhash(
                {'imzml': imzml_file, 'ibd': ibd_file, 'dbs': moldb_ids, 'ds': ds_config}
            )
        else:
            cache_key = None

        self.pipe = Pipeline(
            self.imzml_cobj, self.ibd_cobj, self.moldb_cobjs, self.ds_config, cache_key=cache_key
        )

    def run(self):
        results_df, png_cobjs = self.pipe()
        results_df.to_csv('./results.csv')
        image_names = (
            results_df.formula + results_df.chem_mod + results_df.neutral_loss + results_df.adduct
        )
        out_dir = Path('./result_pngs')
        out_dir.mkdir(exist_ok=True)
        for imageset in iter_cobjs_with_prefetch(self.storage, png_cobjs):
            for formula_i, imgs in imageset:
                for i, img in enumerate(imgs, 1):
                    if img:
                        (out_dir / f'{image_names[formula_i]}_{i}.png').open('wb').write(img)


class ServerAnnotationJob:
    def __init__(
        self,
        img_store: ImageStoreServiceWrapper,
        ds: Dataset,
        sm_config: Optional[Dict] = None,
        use_cache=True,
    ):
        sm_config = sm_config or SMConfig.get_conf()
        self.storage = Storage(
            lithops_config=sm_config['lithops'],
            storage_backend=sm_config['lithops']['lithops']['storage_backend'],
        )
        self.sm_storage = sm_config['lithops']['sm_storage']
        self.ds = ds
        self.img_store = img_store
        self.db = DB()
        self.es = ESExporter(self.db, sm_config)
        self.imzml_cobj, self.ibd_cobj = self._get_input_cobjects()
        self.moldb_cobjects = self._get_moldb_cobjects()

        if use_cache:
            cache_key: Optional[str] = jsonhash({'input_path': ds.input_path, 'ds': ds.config})
        else:
            cache_key = None

        self.pipe = Pipeline(
            self.imzml_cobj, self.ibd_cobj, self.moldb_cobjects, self.ds.config, cache_key=cache_key
        )

    def _get_input_cobjects(self):

        if self.ds.input_path.startswith('/'):
            files = list(Path(self.ds.input_path).iterdir())
            imzml_files = [path for path in files if path.name.lower().endswith('.imzml')]
            ibd_files = [path for path in files if path.name.lower().endswith('.ibd')]
            assert len(imzml_files) == 1, imzml_files
            assert len(ibd_files) == 1, ibd_files
            imzml_cobj = _upload_if_not_exists(
                imzml_files[0], self.storage, self.sm_storage, 'imzml'
            )
            ibd_cobj = _upload_if_not_exists(ibd_files[0], self.storage, self.sm_storage, 'imzml')
        else:
            assert self.ds.input_path.startswith('cos://')
            bucket, prefix = self.ds.input_path.removeprefix('cos://').split('/', maxsplit=1)
            keys = self.storage.list_keys(bucket, prefix)
            imzml_keys = [key for key in keys if key.lower().endswith('.imzml')]
            ibd_keys = [key for key in keys if key.lower().endswith('.ibd')]
            assert len(imzml_keys) == 1, imzml_keys
            assert len(ibd_keys) == 1, ibd_keys
            imzml_cobj = CloudObject(self.storage.backend, bucket, imzml_keys[0])
            ibd_cobj = CloudObject(self.storage.backend, bucket, ibd_keys[0])

        return imzml_cobj, ibd_cobj

    def _get_moldb_cobjects(self):
        cobjs = []
        for moldb_id in self.ds.config['database_ids']:
            bucket, prefix = self.sm_storage['moldb']
            key = f'{prefix}/{moldb_id}'
            try:
                self.storage.head_object(bucket, key)
                logger.debug(f'Found mol db at {key}')
                # This cast doesn't include the generic argument due to
                # https://youtrack.jetbrains.com/issue/PY-43838 (Fix coming in PyCharm 2020.2.3)
                cobject = CloudObject(self.storage.backend, bucket, key)
            except StorageNoSuchKeyError:
                logger.info(f'Uploading mol db to {key}')
                mols_query = DB().select(
                    'SELECT DISTINCT formula FROM molecule WHERE moldb_id = %s', (moldb_id,)
                )
                mols = [mol for mol, in mols_query]
                cobject = save_cobj(self.storage, mols, bucket=bucket, key=key)
            cobjs.append(cobject)

        return cobjs

    def store_images(self, results_df, formula_png_iter):
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

        with ThreadPoolExecutor(2) as ex:
            for formula_png_chunk in formula_png_iter:
                # Join results_df so that each formula_i is associated with one or more
                # moldb_ids
                tasks = (
                    pd.DataFrame(formula_png_chunk, columns=['formula_i', 'pngs'])
                    .set_index('formula_i')
                    .join(results_df)[['moldb_id', 'pngs']]
                    .itertuples(True, None)
                )
                list(ex.map(_upload_images, *zip(*tasks)))

        return db_formula_image_ids

    def run(self):
        isocalc = IsocalcWrapper(self.ds.config)
        del_jobs(self.ds)
        moldb_to_job_map = {}
        for moldb_id in self.ds.config['database_ids']:
            moldb_to_job_map[moldb_id] = insert_running_job(self.ds.id, moldb_id)
        try:
            results_df, png_cobjs = self.pipe()
            self.results_df, self.png_cobjs = results_df, png_cobjs
            db_formula_image_ids = self.store_images(
                results_df, iter_cobjs_with_prefetch(self.storage, png_cobjs)
            )
            self.db_formula_image_ids = db_formula_image_ids

            for moldb_id, job_id in moldb_to_job_map.items():
                formula_image_ids = db_formula_image_ids.get(moldb_id, {})

                search_results = SearchResults(
                    job_id=job_id,
                    metric_names=METRICS.keys(),
                    n_peaks=self.ds.config['isotope_generation']['n_peaks'],
                    charge=self.ds.config['isotope_generation']['charge'],
                )
                metrics_df = results_df[results_df.moldb_id == moldb_id]
                search_results.store_ion_metrics(metrics_df, formula_image_ids, self.db)

                update_finished_job(job_id, JobStatus.FINISHED)
                self.es.index_ds(self.ds.id, molecular_db.find_by_id(moldb_id), isocalc)
        except Exception:
            for moldb_id, job_id in moldb_to_job_map.items():
                update_finished_job(job_id, JobStatus.FAILED)
            raise
