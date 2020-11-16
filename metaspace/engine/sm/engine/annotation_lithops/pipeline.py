from __future__ import annotations

import logging
from typing import List, Tuple, Optional, Dict

import numpy as np
import pandas as pd
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import PortableSpectrumReader

from sm.engine.annotation_lithops.annotate import process_centr_segments
from sm.engine.annotation_lithops.build_moldb import (
    build_moldb,
    validate_formula_cobjects,
    InputMolDb,
    DbFDRData,
)
from sm.engine.annotation_lithops.cache import PipelineCacher, use_pipeline_cache
from sm.engine.annotation_lithops.calculate_centroids import (
    calculate_centroids,
    validate_centroids,
)
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj
from sm.engine.annotation_lithops.load_ds import load_ds, validate_ds_segments
from sm.engine.annotation_lithops.prepare_results import filter_results_and_make_pngs
from sm.engine.annotation_lithops.run_fdr import run_fdr
from sm.engine.annotation_lithops.segment_centroids import (
    segment_centroids,
    clip_centr_df,
    define_centr_segments,
    validate_centroid_segments,
)
from sm.engine.db import DB
from sm.engine.ds_config import DSConfig
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import SMConfig

logger = logging.getLogger('annotation-pipeline')


class Pipeline:
    mols_dbs_cobjects: List[CObj[List[str]]]
    formula_cobjects: List[CObj[pd.DataFrame]]
    db_data_cobjects: List[CObj[DbFDRData]]
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
    fdrs: Dict[int, pd.DataFrame]
    results_dfs: Dict[int, pd.DataFrame]
    png_cobjs: List[CObj[List[Tuple[int, bytes]]]]

    def __init__(
        self,
        imzml_cobject: CloudObject,
        ibd_cobject: CloudObject,
        moldbs: List[InputMolDb],
        ds_config: DSConfig,
        executor: Executor = None,
        lithops_config=None,
        cache_key=None,
    ):
        lithops_config = lithops_config or SMConfig.get_conf()['lithops']
        self._db = DB()
        self.imzml_cobject = imzml_cobject
        self.ibd_cobject = ibd_cobject
        self.moldbs = moldbs
        self.ds_config = ds_config
        self.isocalc_wrapper = IsocalcWrapper(ds_config)

        self.executor = executor or Executor(lithops_config)
        self.storage = self.executor.storage

        if cache_key is not None:
            self.cacher: Optional[PipelineCacher] = PipelineCacher(
                self.storage, cache_key, lithops_config
            )
        else:
            self.cacher = None

        self.ds_segm_size_mb = 128

    def __call__(
        self, debug_validate=False, use_cache=True
    ) -> Tuple[Dict[int, pd.DataFrame], List[CObj[List[Tuple[int, bytes]]]]]:
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

        return self.results_dfs, self.png_cobjs

    @use_pipeline_cache
    def build_moldb(self):
        self.formula_cobjects, self.db_data_cobjects = self.executor.call(
            build_moldb, (self.ds_config, self.moldbs), runtime_memory=2048
        )
        logger.info(
            f'Built {len(self.formula_cobjects)} formula segments and'
            f' {len(self.db_data_cobjects)} db_data objects'
        )

    def validate_build_moldb(self):
        validate_formula_cobjects(self.storage, self.formula_cobjects)

    @use_pipeline_cache
    def calculate_centroids(self):
        self.peaks_cobjects = calculate_centroids(
            self.executor, self.formula_cobjects, self.isocalc_wrapper
        )
        logger.info(f'Calculated {len(self.peaks_cobjects)} centroid chunks')

    def validate_calculate_centroids(self):
        validate_centroids(self.executor, self.peaks_cobjects)

    @use_pipeline_cache
    def load_ds(self):
        sort_memory = 2 ** 32
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
        ) = self.executor.call(
            load_ds,
            (self.imzml_cobject, self.ibd_cobject, self.ds_segm_size_mb, sort_memory),
            runtime_memory=4096,
        )

        logger.info(f'Segmented dataset chunks into {len(self.ds_segms_cobjects)} segments')

        self.is_intensive_dataset = len(self.ds_segms_cobjects) * self.ds_segm_size_mb > 5000

    def validate_load_ds(self):
        validate_ds_segments(
            self.executor,
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
        )

    @use_pipeline_cache
    def segment_centroids(self):
        mz_min, mz_max = self.ds_segments_bounds[0, 0], self.ds_segments_bounds[-1, 1]

        self.clip_centr_chunks_cobjects, centr_n = clip_centr_df(
            self.executor, self.peaks_cobjects, mz_min, mz_max
        )
        centr_segm_lower_bounds = define_centr_segments(
            self.executor,
            self.clip_centr_chunks_cobjects,
            centr_n,
            len(self.ds_segms_cobjects) * self.ds_segm_size_mb,
        )

        max_ds_segms_size_per_db_segm_mb = 2560 if self.is_intensive_dataset else 1536
        self.db_segms_cobjects = segment_centroids(
            self.executor,
            self.clip_centr_chunks_cobjects,
            centr_segm_lower_bounds,
            self.ds_segments_bounds,
            self.ds_segm_size_mb,
            max_ds_segms_size_per_db_segm_mb,
            self.isocalc_wrapper,
        )
        logger.info(f'Segmented centroids chunks into {len(self.db_segms_cobjects)} segments')

    def validate_segment_centroids(self):
        validate_centroid_segments(
            self.executor, self.db_segms_cobjects, self.ds_segments_bounds, self.isocalc_wrapper,
        )

    @use_pipeline_cache
    def annotate(self):
        self.formula_metrics_df, self.images_df = process_centr_segments(
            self.executor,
            self.ds_segms_cobjects,
            self.ds_segments_bounds,
            self.ds_segms_len,
            self.db_segms_cobjects,
            self.imzml_reader,
            self.ds_config,
            self.ds_segm_size_mb,
            self.is_intensive_dataset,
        )
        logger.info(f'Metrics calculated: {self.formula_metrics_df.shape[0]}')

    @use_pipeline_cache
    def run_fdr(self):
        self.fdrs = run_fdr(self.executor, self.formula_metrics_df, self.db_data_cobjects)

    @use_pipeline_cache
    def prepare_results(self):
        self.results_dfs, self.png_cobjs = filter_results_and_make_pngs(
            self.executor,
            self.formula_metrics_df,
            self.moldbs,
            self.fdrs,
            self.images_df,
            self.imzml_reader,
        )

    def clean(self, all_caches=False):
        if self.cacher:
            self.cacher.clean(all_namespaces=all_caches)
        self.executor.clean()
