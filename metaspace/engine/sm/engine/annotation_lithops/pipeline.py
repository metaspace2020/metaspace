from __future__ import annotations

from collections import defaultdict

from lithops.storage import Storage
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import PortableSpectrumReader
from typing import List, Tuple

import lithops
import numpy as np
import pandas as pd

from sm.engine.ds_config import DSConfig
from sm.engine.db import DB
from sm.engine.png_generator import PngGenerator
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
from sm.engine.annotation_lithops.annotate import process_centr_segments, make_sample_area_mask
from sm.engine.annotation_lithops.run_fdr import run_fdr
from sm.engine.annotation_lithops.cache import PipelineCacher, use_pipeline_cache
from sm.engine.annotation_lithops.utils import PipelineStats, logger, ds_dims
from sm.engine.annotation_lithops.io import CObj, iter_cobjs_with_prefetch, save_cobj
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
    images_df: pd.DataFrame
    fdrs: pd.DataFrame
    results_df: pd.DataFrame
    png_cobjs: List[CObj[List[Tuple[int, bytes]]]]

    def __init__(
        self,
        imzml_cobject: CloudObject,
        ibd_cobject: CloudObject,
        moldb_cobjects: List[CloudObject],
        ds_config: DSConfig,
        lithops_config=None,
        cache_key=None,
    ):
        lithops_config = lithops_config or SMConfig.get_conf()['lithops']
        self._db = DB()
        self.imzml_cobject = imzml_cobject
        self.ibd_cobject = ibd_cobject
        self.moldb_cobjects = moldb_cobjects
        self.ds_config = ds_config

        self.config = lithops_config
        if self.config['lithops']['storage_backend'] == 'localhost':
            self.fexec = lithops.local_executor(
                config=self.config, storage_backend=self.config['lithops']['storage_backend']
            )
        else:
            self.fexec = lithops.function_executor(config=self.config, runtime_memory=2048)
        # TODO: vmexec should be a ibm_vpc executor in non-local mode
        self.vmexec = self.fexec

        self.storage = self.fexec.storage

        if cache_key is not None:
            self.cacher = PipelineCacher(self.fexec, cache_key, lithops_config)
        else:
            self.cacher = None

        stats_path_cache_key = 'stats_path'
        if self.cacher and self.cacher.exists(stats_path_cache_key):
            self.stats_path = self.cacher.load(stats_path_cache_key)
            PipelineStats.path = self.stats_path
            logger.info(f'Using cached {self.stats_path} for statistics')
        else:
            PipelineStats.init()
            self.stats_path = PipelineStats.path
            self.cacher.save(self.stats_path, stats_path_cache_key)
            logger.info(f'Initialised {self.stats_path} for statistics')

        self.ds_segm_size_mb = 128

    def __call__(self, debug_validate=False, use_cache=True):
        self.build_moldb(use_cache=use_cache)
        if debug_validate:
            self.validate_build_moldb()

        self.calculate_centroids(use_cache=use_cache)
        if debug_validate:
            self.validate_calculate_centroids()

        self.load_ds(use_cache=use_cache)
        if debug_validate:
            self.validate_load_ds()

        self.segment_centroids(use_cache=use_cache)
        if debug_validate:
            self.validate_segment_centroids()

        self.annotate(use_cache=use_cache)
        self.run_fdr(use_cache=use_cache)
        self.prepare_results(use_cache=use_cache)

        # if debug_validate and self.ds_config['metaspace_id']:
        #     self.check_results()

        return self.results_df, self.png_cobjs

    @use_pipeline_cache
    def build_moldb(self):
        futures = self.vmexec.map(build_moldb, [(self.ds_config, self.moldb_cobjects)])
        __import__('__main__').futures = futures
        (
            self.formula_cobjects,
            self.db_data_cobjects,
            build_db_exec_time,
        ) = self.vmexec.get_result(futures)[0]
        PipelineStats.append_vm(
            'build_database', build_db_exec_time, cloud_objects_n=len(self.formula_cobjects)
        )
        logger.info(
            f'Built {len(self.formula_cobjects)} formula segments and'
            f' {len(self.db_data_cobjects)} db_data objects'
        )

    def validate_build_moldb(self):
        validate_formula_cobjects(self.storage, self.formula_cobjects)

    @use_pipeline_cache
    def calculate_centroids(self):
        self.peaks_cobjects = calculate_centroids(self.fexec, self.formula_cobjects, self.ds_config)
        logger.info(f'Calculated {len(self.peaks_cobjects)} centroid chunks')

    def validate_calculate_centroids(self):
        validate_centroids(self.fexec, self.peaks_cobjects)

    @use_pipeline_cache
    def load_ds(self):
        sort_memory = 2 ** 32
        future = self.vmexec.call_async(
            load_ds, (self.imzml_cobject, self.ibd_cobject, self.ds_segm_size_mb, sort_memory)
        )
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
            ds_segm_stats,
        ) = self.vmexec.get_result(future)

        logger.info(f'Segmented dataset chunks into {len(self.ds_segms_cobjects)} segments')
        for func_name, exec_time in ds_segm_stats:
            if func_name == 'upload_segments':
                cobjs_n = len(self.ds_segms_cobjects)
            else:
                cobjs_n = 0
            PipelineStats.append_vm(func_name, exec_time, cloud_objects_n=cobjs_n)

        self.is_intensive_dataset = len(self.ds_segms_cobjects) * self.ds_segm_size_mb > 5000

    def validate_load_ds(self):
        validate_ds_segments(
            self.fexec,
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
        )

    @use_pipeline_cache
    def segment_centroids(self):
        mz_min, mz_max = self.ds_segments_bounds[0, 0], self.ds_segments_bounds[-1, 1]

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

    def validate_segment_centroids(self):
        validate_centroid_segments(
            self.fexec,
            self.db_segms_cobjects,
            self.ds_segments_bounds,
            self.ds_config['image_generation']['ppm'],
        )

    @use_pipeline_cache
    def annotate(self):
        self.formula_metrics_df, self.images_df = process_centr_segments(
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

    @use_pipeline_cache
    def run_fdr(self):
        futures = self.vmexec.map(run_fdr, [(self.formula_metrics_df, self.db_data_cobjects)])
        ((self.fdrs, fdr_exec_time),) = self.vmexec.get_result(futures)

        PipelineStats.append_vm('calculate_fdrs', fdr_exec_time)

        logger.info('Number of annotations with FDR less than:')
        for fdr_step in [0.05, 0.1, 0.2, 0.5]:
            logger.info(f'{fdr_step*100:2.0f}%: {(self.fdrs.fdr < fdr_step).sum()}')

    @use_pipeline_cache
    def prepare_results(self):
        # formula_metrics_df Dataframe:
        # index: formula_i
        # columns: chaos, spatial, spectral, msm, total_iso_ints, min_iso_ints, max_iso_ints
        # fdrs Dataframe:
        # index: formula_i
        # columns: formula, fdr, moldb_id, modifier, adduct
        results_df = self.formula_metrics_df.join(self.fdrs)
        results_df = results_df[~results_df.adduct.isna()]
        # TODO: Get real list of targeted DBs, only filter by FDR if not targeted
        results_df = results_df[results_df.fdr <= 0.5]
        results_df = results_df.sort_values('fdr')
        self.results_df = results_df

        formula_is = set(results_df.index)
        image_tasks_df = self.images_df[self.images_df.index.isin(formula_is)].copy()
        w, h = ds_dims(self.imzml_reader.coordinates)
        # Guess the cost per imageset, and split into relatively even chunks.
        # This is a quick attempt and needs review
        # This assumes they're already sorted by cobj, and factors in:
        # * Number of populated pixels (because very sparse images should be much faster to encode)
        # * Total image size (because even empty pixels have some cost)
        # * Cost of loading a new cobj
        # * Constant overhead per image
        cobj_keys = [cobj.key for cobj in image_tasks_df.cobj]
        cobj_changed = np.array(
            [(i == 0 or key == cobj_keys[i - 1]) for i, key in enumerate(cobj_keys)]
        )
        image_tasks_df['cost'] = (
            image_tasks_df.n_pixels + (w * h) / 5 + cobj_changed * 100000 + 1000
        )
        total_cost = image_tasks_df.cost.sum()
        n_jobs = int(np.ceil(np.clip(total_cost / 1e8, 1, 100)))
        job_bound_vals = np.linspace(0, total_cost + 1, n_jobs + 1)
        job_bound_idxs = np.searchsorted(np.cumsum(image_tasks_df.cost), job_bound_vals)
        print(job_bound_idxs, len(image_tasks_df))
        jobs = [
            [image_tasks_df.iloc[start:end]]
            for start, end in zip(job_bound_idxs[:-1], job_bound_idxs[1:])
            if start != end
        ]
        job_costs = [df.cost.sum() for df, in jobs]
        print(
            f'Generated {len(jobs)} PNG jobs, min cost: {np.min(job_costs)}, '
            f'max cost: {np.max(job_costs)}, total cost: {total_cost}'
        )
        png_generator = PngGenerator(make_sample_area_mask(self.imzml_reader.coordinates))

        def save_png_chunk(df: pd.DataFrame, *, storage: Storage):
            pngs = []
            groups = defaultdict(lambda: [])
            for formula_i, cobj in df.cobj.items():
                groups[cobj].append(formula_i)

            image_dict_iter = iter_cobjs_with_prefetch(storage, list(groups.keys()))
            for image_dict, formula_is in zip(image_dict_iter, groups.values()):
                for formula_i in formula_is:
                    formula_pngs = [
                        png_generator.generate_png(img.toarray()) if img is not None else None
                        for img in image_dict[formula_i]
                    ]
                    pngs.append((formula_i, formula_pngs))
            return save_cobj(storage, pngs)

        futures = self.fexec.map(save_png_chunk, jobs, include_modules=['sm', 'sm.engine', 'png'])
        self.png_cobjs = self.fexec.get_result(futures)

    def check_results(self):
        ds_id = 'TODO'
        reference_results = get_reference_results(ds_id)

        checked_results = check_results(self.results_df, reference_results)

        log_bad_results(**checked_results)
        return checked_results

    def clean(self):
        if self.cacher:
            self.cacher.clean()
        self.fexec.clean()
        self.vmexec.clean()
