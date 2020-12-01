from __future__ import annotations

import logging
from typing import List, Tuple, Optional, Dict

import numpy as np
import pandas as pd
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import PortableSpectrumReader

from sm.engine.annotation_lithops.annotate import process_centr_segments
from sm.engine.annotation_lithops.build_moldb import InputMolDb, DbFDRData
from sm.engine.annotation_lithops.cache import PipelineCacher, use_pipeline_cache
from sm.engine.annotation_lithops.calculate_centroids import calculate_centroids, validate_centroids
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj
from sm.engine.annotation_lithops.load_ds import load_ds, validate_ds_segments
from sm.engine.annotation_lithops.moldb_pipeline import get_moldb_centroids
from sm.engine.annotation_lithops.prepare_results import filter_results_and_make_pngs
from sm.engine.annotation_lithops.run_fdr import run_fdr
from sm.engine.annotation_lithops.segment_centroids import (
    segment_centroids,
    validate_centroid_segments,
)
from sm.engine.db import DB
from sm.engine.ds_config import DSConfig
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import SMConfig

logger = logging.getLogger('annotation-pipeline')


class Pipeline:  # pylint: disable=too-many-instance-attributes
    mols_dbs_cobjects: List[CObj[List[str]]]
    formula_cobjects: List[CObj[pd.DataFrame]]
    db_data_cobjects: List[CObj[DbFDRData]]
    peaks_cobjects: List[CObj[pd.DataFrame]]
    imzml_reader: PortableSpectrumReader
    ds_segments_bounds: np.ndarray
    ds_segms_cobjects: List[CObj[pd.DataFrame]]
    ds_segm_lens: np.ndarray

    is_intensive_dataset: bool
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
        use_db_cache=True,
    ):
        lithops_config = lithops_config or SMConfig.get_conf()['lithops']
        self.lithops_config = lithops_config
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

        self.use_db_cache = use_db_cache
        self.ds_segm_size_mb = 128

    def __call__(
        self, debug_validate=False, use_cache=True
    ) -> Tuple[Dict[int, pd.DataFrame], List[CObj[List[Tuple[int, bytes]]]]]:
        # pylint: disable=unexpected-keyword-arg
        self.prepare_moldb(debug_validate=debug_validate)

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

    def prepare_moldb(self, debug_validate=False):
        self.db_data_cobjects, self.peaks_cobjects = get_moldb_centroids(
            executor=self.executor,
            sm_storage=self.lithops_config['sm_storage'],
            ds_config=self.ds_config,
            moldbs=self.moldbs,
            debug_validate=debug_validate,
            use_cache=self.use_db_cache,
        )

    @use_pipeline_cache
    def calculate_centroids(self):
        self.peaks_cobjects = calculate_centroids(
            self.executor, self.formula_cobjects, self.isocalc_wrapper
        )

    def validate_calculate_centroids(self):
        validate_centroids(self.executor, self.peaks_cobjects)

    @use_pipeline_cache
    def load_ds(self):
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segm_lens,
        ) = load_ds(self.executor, self.imzml_cobject, self.ibd_cobject, self.ds_segm_size_mb)

        self.is_intensive_dataset = len(self.ds_segms_cobjects) * self.ds_segm_size_mb > 5000

    def validate_load_ds(self):
        validate_ds_segments(
            self.executor,
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segm_lens,
        )

    @use_pipeline_cache
    def segment_centroids(self):
        self.db_segms_cobjects = segment_centroids(
            self.executor,
            self.peaks_cobjects,
            self.ds_segms_cobjects,
            self.ds_segments_bounds,
            self.ds_segm_size_mb,
            self.is_intensive_dataset,
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
            self.ds_segm_lens,
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
