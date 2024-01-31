from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from lithops.storage.utils import CloudObject

from sm.engine.annotation.acq_geometry import make_acq_geometry_lithops
from sm.engine.annotation.diagnostics import FdrDiagnosticBundle
from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.annotation_lithops.run_enrichment import run_enrichment
from sm.engine.annotation_lithops.annotate import process_centr_segments
from sm.engine.annotation_lithops.build_moldb import InputMolDb, DbFDRData
from sm.engine.annotation_lithops.cache import PipelineCacher, use_pipeline_cache
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj, iter_cobjs_with_prefetch
from sm.engine.annotation_lithops.load_ds import load_ds, validate_ds_segments
from sm.engine.annotation_lithops.moldb_pipeline import get_moldb_centroids
from sm.engine.annotation_lithops.prepare_results import (
    filter_results_and_make_pngs,
    get_fdr_bundles,
)
from sm.engine.annotation_lithops.run_fdr import run_fdr
from sm.engine.annotation_lithops.segment_centroids import (
    segment_centroids,
    validate_centroid_segments,
)
from sm.engine.annotation_lithops.store_images import store_images_to_s3
from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.ds_config import DSConfig


logger = logging.getLogger('annotation-pipeline')


class Pipeline:  # pylint: disable=too-many-instance-attributes
    formula_cobjs: List[CObj[pd.DataFrame]]
    db_data_cobjs: List[CObj[DbFDRData]]
    peaks_cobjs: List[CObj[pd.DataFrame]]
    imzml_reader: LithopsImzMLReader
    ds_segments_bounds: np.ndarray
    ds_segms_cobjs: List[CObj[pd.DataFrame]]
    ds_segm_lens: np.ndarray
    is_intensive_dataset: bool
    db_segms_cobjs: List[CObj[pd.DataFrame]]
    formula_metrics_df: pd.DataFrame
    images_df: pd.DataFrame
    fdrs: Dict[int, pd.DataFrame]
    results_dfs: Dict[int, pd.DataFrame]
    png_cobjs: List[CObj[List[Tuple[int, bytes]]]]

    # pylint: disable=too-many-arguments
    def __init__(
        self,
        imzml_cobject: CloudObject,
        ibd_cobject: CloudObject,
        moldbs: List[InputMolDb],
        ds_config: DSConfig,
        executor: Executor = None,
        ds_id: Union[str, None] = None,
        lithops_config=None,
        cache_key=None,
        use_db_cache=True,
        use_db_mutex=True,
    ):
        lithops_config = lithops_config or SMConfig.get_conf()['lithops']
        self.lithops_config = lithops_config
        self._db = DB()
        self.imzml_cobject = imzml_cobject
        self.ibd_cobject = ibd_cobject
        self.moldbs = moldbs
        self.ds_config = ds_config
        self.ds_id = ds_id
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
        self.use_db_mutex = use_db_mutex
        self.ds_segm_size_mb = 128

        self.enrichment_data = None
        self.ds_size_hash = None

    def run_pipeline(
        self, debug_validate=False, use_cache=True, perform_enrichment=False
    ) -> Tuple[Dict[int, pd.DataFrame], List[CObj[List[Tuple[int, bytes]]]], Any]:
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

        if perform_enrichment:
            self.run_enrichment(use_cache=use_cache)

        return self.results_dfs, self.png_cobjs, self.enrichment_data

    def prepare_moldb(self, debug_validate=False):
        self.db_data_cobjs, self.peaks_cobjs = get_moldb_centroids(
            executor=self.executor,
            sm_storage=self.lithops_config['sm_storage'],
            ds_config=self.ds_config,
            moldbs=self.moldbs,
            debug_validate=debug_validate,
            use_cache=self.use_db_cache,
            use_db_mutex=self.use_db_mutex,
        )

    @use_pipeline_cache
    def load_ds(self):
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjs,
            self.ds_segm_lens,
            self.ds_size_hash,
        ) = load_ds(
            self.executor, self.imzml_cobject, self.ibd_cobject, self.ds_segm_size_mb, self.ds_id
        )

        self.is_intensive_dataset = len(self.ds_segms_cobjs) * self.ds_segm_size_mb > 5000

    def validate_load_ds(self):
        validate_ds_segments(
            self.executor,
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjs,
            self.ds_segm_lens,
        )

    @use_pipeline_cache
    def segment_centroids(self):
        self.db_segms_cobjs = segment_centroids(
            self.executor,
            self.peaks_cobjs,
            self.ds_segms_cobjs,
            self.ds_segments_bounds,
            self.ds_segm_size_mb,
            self.is_intensive_dataset,
            self.isocalc_wrapper,
        )
        logger.info(f'Segmented centroids chunks into {len(self.db_segms_cobjs)} segments')

    def validate_segment_centroids(self):
        validate_centroid_segments(
            self.executor,
            self.db_segms_cobjs,
            self.ds_segments_bounds,
            self.isocalc_wrapper,
        )

    @use_pipeline_cache
    def annotate(self):
        self.formula_metrics_df, self.images_df = process_centr_segments(
            self.executor,
            self.ds_segms_cobjs,
            self.ds_segments_bounds,
            self.ds_segm_lens,
            self.db_segms_cobjs,
            self.imzml_reader,
            self.ds_config,
            self.ds_segm_size_mb,
            self.is_intensive_dataset,
        )
        logger.info(f'Metrics calculated: {self.formula_metrics_df.shape[0]}')

    @use_pipeline_cache
    def run_fdr(self):
        self.fdrs = run_fdr(
            self.executor, self.formula_metrics_df, self.db_data_cobjs, self.ds_config
        )

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

    @use_pipeline_cache
    def run_enrichment(self):
        self.enrichment_data = run_enrichment(self.results_dfs)

    def save_acq_geometry(self, ds):
        """Stores acquisition geometry to DB.
        Not part of run_pipeline because this is unwanted when running from a LocalAnnotationJob."""
        dims = (self.imzml_reader.h, self.imzml_reader.w)
        acq_geometry = make_acq_geometry_lithops(ds.metadata, dims, self.imzml_reader.n_spectra)
        ds.save_acq_geometry(self._db, acq_geometry)

    def store_ds_size_hash(self):
        """Stores size and md5 hash of imzML/ibd files.
        Not part of run_pipeline because this is unwanted when running from a LocalAnnotationJob."""
        db = DB()
        db.alter(
            'UPDATE dataset SET size_hash = %s WHERE id = %s',
            (json.dumps(self.ds_size_hash), self.ds_id),
        )

    def store_images_to_s3(self, ds_id: str):
        """Stores ion images to S3 ImageStorage. Not part of run_pipeline because this is unwanted
        when running from a LocalAnnotationJob."""
        formula_i_to_db_id = pd.concat([df.moldb_id for df in self.results_dfs.values()])
        return store_images_to_s3(
            self.executor,
            ds_id,
            formula_i_to_db_id,
            self.png_cobjs,
        )

    def get_fdr_bundles(self, db_id_to_job_id: Dict[int, int]) -> Dict[int, FdrDiagnosticBundle]:
        return get_fdr_bundles(
            self.storage, self.formula_metrics_df, self.db_data_cobjs, db_id_to_job_id
        )

    def clean(self, all_caches=False):
        if self.cacher:
            self.cacher.clean(all_namespaces=all_caches)
        self.executor.clean()

    def debug_get_annotation_data(self, formula, modifier):
        """Debugging tool for finding relevant data about a particular annotation, e.g. for
        investigating MSM or image generation issues"""
        # pylint: disable=possibly-unused-variable
        # Find formula_i(s)
        db_data_idxs = []
        db_datas = []
        formula_is = []
        for idx, db_data in enumerate(iter_cobjs_with_prefetch(self.storage, self.db_data_cobjs)):
            df = db_data['formula_map_df']
            df = df[(df.formula == formula) & (df.modifier == modifier)]
            if not df.empty:
                db_data_idxs.append(idx)
                db_datas.append(db_data)
                formula_is.extend(df.formula_i.tolist())

        # Find centroids
        peaks_df_idxs = []
        peaks_dfs = []
        peaks = []
        for idx, peaks_df in enumerate(iter_cobjs_with_prefetch(self.storage, self.peaks_cobjs)):
            df = peaks_df[peaks_df.index.isin(formula_is)]
            if not df.empty:
                peaks_df_idxs.append(idx)
                peaks_dfs.append(peaks_df)
                peaks.append(df)
        peaks = pd.concat(peaks) if len(peaks) > 0 else None

        # Find MSM
        metrics = self.formula_metrics_df[self.formula_metrics_df.index.isin(formula_is)]

        del idx, df

        return locals()
