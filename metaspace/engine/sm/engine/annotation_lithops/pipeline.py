from lithops.storage.utils import StorageNoSuchKeyError, CloudObject
from pyimzml.ImzMLParser import PortableSpectrumReader
from scipy.sparse import coo_matrix
from typing import List, cast, Dict

import lithops
import numpy as np
import pandas as pd

from sm.engine.dataset import DSConfig
from sm.engine.db import DB
from sm.engine.search_results import SearchResults
from sm.engine.annotation_lithops.check_results import (
    get_reference_results,
    check_results,
    log_bad_results,
)
from sm.engine.annotation_lithops.build_moldb import (
    build_moldb,
    validate_formula_cobjects,
    DbDataTuple,
)
from sm.engine.annotation_lithops.calculate_centroids import (
    calculate_centroids,
    validate_centroids,
)
from sm.engine.annotation_lithops.load_ds import load_ds, validate_ds_segments
from sm.engine.annotation_lithops.segment_centroids import (
    segment_centroids,
    clip_centr_df,
    define_centr_segments,
    validate_centroid_segments,
)
from sm.engine.annotation_lithops.annotate import process_centr_segments
from sm.engine.annotation_lithops.run_fdr import run_fdr
from sm.engine.annotation_lithops.cache import PipelineCacher
from sm.engine.annotation_lithops.utils import PipelineStats, logger, jsonhash
from sm.engine.annotation_lithops.io import CObj, save_cobj, load_cobj
from sm.engine.util import SMConfig


class Pipeline:
    mols_dbs_cobjects: List[CObj[List[str]]]
    formula_cobjects: List[CObj[pd.DataFrame]]
    db_data_cobjects: List[CObj[DbDataTuple]]
    peaks_cobjects: List[CObj[pd.DataFrame]]
    imzml_reader: PortableSpectrumReader
    ds_segments_bounds: np.ndarray
    ds_segms_cobjects: List[CObj[pd.DataFrame]]
    ds_segms_len: np.ndarray
    is_intensive_dataset: bool
    clip_centr_chunks_cobjects: List[CObj[pd.DataFrame]]
    db_segms_cobjects: List[CObj[pd.DataFrame]]
    formula_metrics_df: pd.DataFrame
    images_cloud_objs: List[CObj[Dict[int, List[coo_matrix]]]]
    fdrs: pd.DataFrame
    results_df: pd.DataFrame

    def __init__(
        self, ds_id: str, input_path: str, ds_config: DSConfig, use_db_cache=True, use_ds_cache=True
    ):
        sm_config = SMConfig.get_conf()
        self._db = DB()
        self.ds_id = ds_id
        self.input_path = input_path
        self.ds_config = ds_config
        self.use_db_cache = use_db_cache
        self.use_ds_cache = use_ds_cache

        self.config = sm_config['lithops']
        self.fexec = lithops.function_executor(config=self.config, runtime_memory=2048)
        self.vmexec = lithops.docker_executor(
            config=self.config, storage_backend=self.config['pywren']['storage_backend']
        )
        self.storage = self.fexec.storage

        db_cache_key = jsonhash(ds_config)
        self.cacher = PipelineCacher(self.fexec, 'vm', ds_id, db_cache_key)
        if not self.use_db_cache or not self.use_ds_cache:
            self.cacher.clean(database=not self.use_db_cache, dataset=not self.use_ds_cache)

        stats_path_cache_key = ':ds/:db/stats_path.cache'
        if self.cacher.exists(stats_path_cache_key):
            self.stats_path = self.cacher.load(stats_path_cache_key)
            PipelineStats.path = self.stats_path
            logger.info(f'Using cached {self.stats_path} for statistics')
        else:
            PipelineStats.init()
            self.stats_path = PipelineStats.path
            self.cacher.save(self.stats_path, stats_path_cache_key)
            logger.info(f'Initialised {self.stats_path} for statistics')

        self.ds_segm_size_mb = 128

    def __call__(self, task='all', debug_validate=False):

        if task == 'all' or task == 'db':
            self.upload_moldb()
            self.build_moldb(debug_validate=debug_validate)
            self.calculate_centroids(debug_validate=debug_validate)

        if task == 'all' or task == 'ds':
            self.load_ds(debug_validate=debug_validate)
            self.segment_centroids(debug_validate=debug_validate)
            self.annotate()
            self.run_fdr()

            # if debug_validate and self.ds_config['metaspace_id']:
            #     self.check_results()

    def upload_moldb(self, use_cache=True):
        cache_key = ':db/upload_molecular_databases.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.mols_dbs_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.mols_dbs_cobjects)} molecular databases from cache')
        else:
            bucket = self.config['storage']['moldb_bucket']
            self.mols_dbs_cobjects = []
            for moldb_id in self.ds_config['database_ids']:
                key = f'moldb_mols/{moldb_id}'
                try:
                    logger.debug(f'Found mol db at {key}')
                    self.storage.head_object(bucket, key)
                    # This cast doesn't include the generic argument due to
                    # https://youtrack.jetbrains.com/issue/PY-43838 (Fix coming in PyCharm 2020.2.3)
                    cobject: CObj[List[str]] = cast(
                        CObj, CloudObject(self.storage.backend, bucket, key)
                    )
                except StorageNoSuchKeyError:
                    logger.info(f'Uploading mol db to {key}')
                    mols_query = DB().select(
                        'SELECT DISTINCT formula FROM molecule WHERE moldb_id = %s', (moldb_id,)
                    )
                    mols = [mol for mol, in mols_query]
                    cobject = save_cobj(self.storage, mols, bucket=bucket, key=key)
                self.mols_dbs_cobjects.append(cobject)

            logger.info(f'Uploaded {len(self.mols_dbs_cobjects)} molecular databases')
            self.cacher.save(self.mols_dbs_cobjects, cache_key)

    def build_moldb(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/:db/build_database.cache'
        if use_cache and self.cacher.exists(cache_key):
            self.formula_cobjects, self.db_data_cobjects = self.cacher.load(cache_key)
            logger.info(
                f'Loaded {len(self.formula_cobjects)} formula segments and'
                f' {len(self.db_data_cobjects)} db_data objects from cache'
            )
        else:
            self.vmexec.call_async(build_moldb, self.ds_config, self.mols_dbs_cobjects)
            (
                self.formula_cobjects,
                self.db_data_cobjects,
                build_db_exec_time,
            ) = self.vmexec.get_result()
            PipelineStats.append_vm(
                'build_database', build_db_exec_time, cloud_objects_n=len(self.formula_cobjects)
            )
            logger.info(
                f'Built {len(self.formula_cobjects)} formula segments and'
                f' {len(self.db_data_cobjects)} db_data objects'
            )
            self.cacher.save((self.formula_cobjects, self.db_data_cobjects), cache_key)

        if debug_validate:
            validate_formula_cobjects(self.storage, self.formula_cobjects)

    def calculate_centroids(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/:db/calculate_centroids.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.peaks_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.peaks_cobjects)} centroid chunks from cache')
        else:
            self.peaks_cobjects = calculate_centroids(
                self.fexec, self.formula_cobjects, self.ds_config
            )
            logger.info(f'Calculated {len(self.peaks_cobjects)} centroid chunks')
            self.cacher.save(self.peaks_cobjects, cache_key)

        if debug_validate:
            validate_centroids(self.fexec, self.peaks_cobjects)

    def load_ds(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/segment_ds.cache'

        if use_cache and self.cacher.exists(cache_key):
            result = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(result[2])} dataset segments from cache')
        else:
            sort_memory = 2 ** 32
            self.vmexec.call_async(load_ds, (self.ds_config, self.ds_segm_size_mb, sort_memory))
            result = self.vmexec.get_result()

            logger.info(f'Segmented dataset chunks into {len(result[2])} segments')
            self.cacher.save(result, cache_key)
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
            ds_segm_stats,
        ) = result
        for func_name, exec_time in ds_segm_stats:
            if func_name == 'upload_segments':
                cobjs_n = len(self.ds_segms_cobjects)
            else:
                cobjs_n = 0
            PipelineStats.append_vm(func_name, exec_time, cloud_objects_n=cobjs_n)

        self.is_intensive_dataset = len(self.ds_segms_cobjects) * self.ds_segm_size_mb > 5000

        if debug_validate:
            validate_ds_segments(
                self.fexec,
                self.imzml_reader,
                self.ds_segments_bounds,
                self.ds_segms_cobjects,
                self.ds_segms_len,
            )

    def segment_centroids(self, use_cache=True, debug_validate=False):
        mz_min, mz_max = self.ds_segments_bounds[0, 0], self.ds_segments_bounds[-1, 1]
        cache_key = ':ds/:db/segment_centroids.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.clip_centr_chunks_cobjects, self.db_segms_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.db_segms_cobjects)} centroids segments from cache')
        else:
            self.clip_centr_chunks_cobjects, centr_n = clip_centr_df(
                self.fexec, self.peaks_cobjects, mz_min, mz_max
            )
            centr_segm_lower_bounds = define_centr_segments(
                self.fexec,
                self.clip_centr_chunks_cobjects,
                centr_n,
                len(self.ds_segms_cobjects) * self.ds_segm_size_mb,
            )

            max_ds_segms_size_per_db_segm_mb = 2560 if self.is_intensive_dataset else 1536
            self.db_segms_cobjects = segment_centroids(
                self.fexec,
                self.clip_centr_chunks_cobjects,
                centr_segm_lower_bounds,
                self.ds_segments_bounds,
                self.ds_segm_size_mb,
                max_ds_segms_size_per_db_segm_mb,
                self.ds_config['image_generation']['ppm'],
            )
            logger.info(f'Segmented centroids chunks into {len(self.db_segms_cobjects)} segments')

            self.cacher.save((self.clip_centr_chunks_cobjects, self.db_segms_cobjects), cache_key)

        if debug_validate:
            validate_centroid_segments(
                self.fexec,
                self.db_segms_cobjects,
                self.ds_segments_bounds,
                self.ds_config['image_generation']['ppm'],
            )

    def annotate(self, use_cache=True):
        cache_key = ':ds/:db/annotate.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.formula_metrics_df, self.images_cloud_objs = self.cacher.load(cache_key)
            logger.info(f'Loaded {self.formula_metrics_df.shape[0]} metrics from cache')
        else:
            self.formula_metrics_df, self.images_cloud_objs = process_centr_segments(
                self.fexec,
                self.ds_segms_cobjects,
                self.ds_segments_bounds,
                self.ds_segms_len,
                self.db_segms_cobjects,
                self.imzml_reader,
                self.ds_config['image_generation'],
                self.ds_segm_size_mb,
                self.is_intensive_dataset,
            )
            logger.info(f'Metrics calculated: {self.formula_metrics_df.shape[0]}')

            self.cacher.save((self.formula_metrics_df, self.images_cloud_objs), cache_key)

    def run_fdr(self, use_cache=True):
        cache_key = ':ds/:db/run_fdr.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.fdrs = self.cacher.load(cache_key)
            logger.info('Loaded fdrs from cache')
        else:
            self.vmexec.call_async(run_fdr, (self.formula_metrics_df, self.db_data_cobjects))
            self.fdrs, fdr_exec_time = self.vmexec.get_result()

            PipelineStats.append_vm('calculate_fdrs', fdr_exec_time)
            self.cacher.save(self.fdrs, cache_key)

        logger.info('Number of annotations with FDR less than:')
        for fdr_step in [0.05, 0.1, 0.2, 0.5]:
            logger.info(f'{fdr_step*100:2.0f}%: {(self.fdrs.fdr < fdr_step).sum()}')

    def prepare_results(self):
        results_df = self.formula_metrics_df.join(self.fdrs)
        results_df = results_df[~results_df.adduct.isna()]
        # TODO: Get real list of targeted DBs, only filter by FDR if not targeted
        results_df = results_df[results_df.fdr <= 0.5]
        results_df = results_df.sort_values('fdr')
        # TODO: Find what this needs to be merged with to include moldb_id, formula, adduct, etc.
        self.results_df = results_df

        formula_is = set(results_df.index)

        # TODO: Convert images to PNGs

    def save_results_to_server(self):
        sr = SearchResults()

    def get_results(self):
        results_df = self.formula_metrics_df.merge(self.fdrs, left_index=True, right_index=True)
        results_df = results_df[~results_df.adduct.isna()]
        results_df = results_df.sort_values('fdr')
        self.results_df = results_df
        return results_df

    def get_images(self):
        # Only download interesting images, to prevent running out of memory
        targets = set(self.results_df.index[self.results_df.fdr <= 0.5])

        def get_target_images(images_cobject, storage):
            images = {}
            segm_images = load_cobj(storage, images_cobject)
            for k, v in segm_images.items():
                if k in targets:
                    images[k] = v
            return images

        futures = self.fexec.map(get_target_images, self.images_cloud_objs, runtime_memory=1024)
        all_images = {}
        for image_set in self.fexec.get_result(futures):
            all_images.update(image_set)

        return all_images

    def check_results(self):
        results_df = self.get_results()
        reference_results = get_reference_results(self.ds_id)

        checked_results = check_results(results_df, reference_results)

        log_bad_results(**checked_results)
        return checked_results

    def clean(self, hard=False):
        self.cacher.clean(hard=hard)
