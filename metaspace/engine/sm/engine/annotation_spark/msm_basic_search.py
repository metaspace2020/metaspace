import logging
from pathlib import Path
from shutil import rmtree
from typing import Tuple, List, Set, Iterable

import numpy as np
import pandas as pd
import pyspark
from pyspark.files import SparkFiles
from pyspark.storagelevel import StorageLevel

from sm.engine import molecular_db
from sm.engine.annotation.formula_centroids import CentroidsGenerator
from sm.engine.annotation.imzml_parser import ImzMLParserWrapper
from sm.engine.annotation_spark.formula_imager import create_process_segment
from sm.engine.annotation_spark.segmenter import (
    calculate_centroids_segments_n,
    calculate_chunk_sp_n,
    check_spectra_quality,
    clip_centroids_df,
    define_ds_segments,
    segment_centroids,
    segment_ds,
    spectra_sample_gen,
)
from sm.engine.ds_config import DSConfig
from sm.engine.annotation.fdr import FDR
from sm.engine.formula_parser import safe_generate_ion_formula
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.molecular_db import MolecularDB
from sm.engine.config import SMConfig
from sm.engine.utils.perf_profile import Profiler

logger = logging.getLogger('engine')


def init_fdr(ds_config: DSConfig, moldbs: List[MolecularDB]) -> List[Tuple[MolecularDB, FDR]]:
    """Randomly select decoy adducts for each moldb and target adduct."""

    isotope_gen_config = ds_config['isotope_generation']
    logger.info('Selecting decoy adducts')
    moldb_fdr_list = []
    for moldb in moldbs:
        fdr = FDR(
            fdr_config=ds_config['fdr'],
            chem_mods=isotope_gen_config['chem_mods'],
            neutral_losses=isotope_gen_config['neutral_losses'],
            target_adducts=isotope_gen_config['adducts'],
            analysis_version=ds_config.get('analysis_version', 1),
        )
        fdr.decoy_adducts_selection(molecular_db.fetch_formulas(moldb.id))
        moldb_fdr_list.append((moldb, fdr))
    return moldb_fdr_list


def collect_ion_formulas(
    spark_context: pyspark.SparkContext, moldb_fdr_list: List[Tuple[MolecularDB, FDR]]
) -> pd.DataFrame:
    """Collect all ion formulas that need to be searched for."""

    logger.info('Collecting ion formulas')

    def gen_ion_formulas(args):
        formula, modifier = args
        ion_formula = safe_generate_ion_formula(formula, modifier)
        return ion_formula, formula, modifier

    ion_formula_map_dfs = []
    for moldb, fdr in moldb_fdr_list:
        ion_formulas = (
            spark_context.parallelize(fdr.ion_tuples())
            .map(gen_ion_formulas)
            .filter(lambda t: t[0])
            .collect()
        )
        df = pd.DataFrame(ion_formulas, columns=['ion_formula', 'formula', 'modifier'])
        df.insert(0, 'moldb_id', moldb.id)
        ion_formula_map_dfs.append(df)

    return pd.concat(ion_formula_map_dfs)


def merge_results(results_rdd, formulas_df):
    formula_metrics_df = pd.concat(results_rdd.map(lambda t: t[0]).collect())
    formula_metrics_df = formula_metrics_df.join(formulas_df, how='left')
    formula_metrics_df = formula_metrics_df.rename(
        {'formula': 'ion_formula'}, axis=1
    )  # needed for fdr

    formula_images_rdd = results_rdd.flatMap(lambda t: t[1].items())
    return formula_metrics_df, formula_images_rdd


def union_target_modifiers(moldb_fdr_list):
    return set().union(*(fdr.target_modifiers() for moldb, fdr in moldb_fdr_list))


def _left_merge(df1, df2, on):
    return pd.merge(df1.reset_index(), df2, how='left', on=on).set_index(df1.index.name or 'index')


def compute_fdr(fdr, formula_metrics_df, formula_map_df) -> pd.DataFrame:
    """Compute fdr and filter formulas."""

    moldb_ion_metrics_df = _left_merge(formula_metrics_df, formula_map_df, on='ion_formula')
    formula_fdr_df = fdr.estimate_fdr(moldb_ion_metrics_df[['formula', 'modifier', 'msm']])
    # fdr is computed only for target modification ions
    moldb_ion_metrics_df = _left_merge(
        moldb_ion_metrics_df, formula_fdr_df, on=['formula', 'modifier']
    )
    return moldb_ion_metrics_df


def compute_fdr_and_filter_results(
    moldb: MolecularDB,
    fdr: FDR,
    ion_formula_map_df: pd.DataFrame,
    formula_metrics_df: pd.DataFrame,
    formula_images_rdd: pyspark.RDD,
) -> Tuple[pd.DataFrame, pyspark.RDD]:
    """Compute FDR for database annotations and filter them."""

    moldb_formula_map_df = ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id].drop(
        'moldb_id', axis=1
    )
    moldb_metrics_fdr_df = compute_fdr(fdr, formula_metrics_df, moldb_formula_map_df)
    if not moldb.targeted:
        max_fdr = 0.5
        moldb_metrics_fdr_df = moldb_metrics_fdr_df[moldb_metrics_fdr_df.fdr <= max_fdr]
    else:
        # fdr is not null for target ion formulas
        moldb_metrics_fdr_df = moldb_metrics_fdr_df[~moldb_metrics_fdr_df.fdr.isnull()]

    moldb_ion_images_rdd = formula_images_rdd.filter(
        lambda kv: kv[0] in moldb_metrics_fdr_df.index  # pylint: disable=cell-var-from-loop
    )
    moldb_ion_metrics_df = moldb_metrics_fdr_df.merge(
        fdr.target_modifiers_df, left_on='modifier', right_index=True
    )
    return moldb_ion_metrics_df, moldb_ion_images_rdd


class MSMSearch:
    def __init__(
        self,
        spark_context: pyspark.SparkContext,
        imzml_wrapper: ImzMLParserWrapper,
        moldbs: List[MolecularDB],
        ds_config: DSConfig,
        ds_data_path: Path,
        perf: Profiler,
    ):
        self._spark_context = spark_context
        self._ds_config = ds_config
        self._imzml_wrapper = imzml_wrapper
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()
        self._ds_data_path = ds_data_path
        self._perf = perf

    def _fetch_formula_centroids(self, ion_formula_map_df):
        """Generate/load centroids for all ions formulas"""
        logger.info('Fetching formula centroids')
        isocalc = IsocalcWrapper(self._ds_config)
        centroids_gen = CentroidsGenerator(sc=self._spark_context, isocalc=isocalc)
        ion_formulas = np.unique(ion_formula_map_df.ion_formula.values)
        formula_centroids = centroids_gen.generate_if_not_exist(formulas=ion_formulas.tolist())
        logger.debug(f'Formula centroids df size: {formula_centroids.centroids_df().shape}')
        return formula_centroids

    def process_segments(self, centr_segm_n, func):
        logger.info(f'Processing {centr_segm_n} centroid segments...')
        centr_segm_inds = np.arange(centr_segm_n)
        np.random.shuffle(centr_segm_inds)
        results_rdd = (
            self._spark_context.parallelize(centr_segm_inds, numSlices=centr_segm_n)
            .map(func)
            .persist(storageLevel=StorageLevel.MEMORY_AND_DISK)
        )
        return results_rdd

    def put_segments_to_workers(self, path):
        logger.debug(f'Adding segment files from local path {path}')
        for file_path in path.iterdir():
            self._spark_context.addFile(str(file_path))

    def remove_spark_temp_files(self):
        logger.debug(f'Cleaning spark master temp dir {SparkFiles.getRootDirectory()}')
        rmtree(SparkFiles.getRootDirectory(), ignore_errors=True)

        temp_dir_rdd = self._spark_context.parallelize(
            range(self._spark_context.defaultParallelism)
        ).map(lambda args: SparkFiles.getRootDirectory())
        logger.debug(f'Cleaning spark workers temp dirs: {set(temp_dir_rdd.collect())}')
        (temp_dir_rdd.map(lambda path: rmtree(path, ignore_errors=True)).collect())

    def define_segments_and_segment_ds(self, sample_ratio=0.05, ds_segm_size_mb=5):
        logger.info('Reading spectra sample')
        spectra_n = self._imzml_wrapper.n_spectra
        sample_size = int(spectra_n * sample_ratio)
        sample_size = np.clip(sample_size, min(spectra_n, 20), 1000)
        spectra_sample = list(spectra_sample_gen(self._imzml_wrapper, sample_size))
        sample_mzs = np.concatenate([mzs for sp_id, mzs, ints in spectra_sample])
        sample_ints = np.concatenate([ints for sp_id, mzs, ints in spectra_sample])
        check_spectra_quality(sample_mzs, sample_ints)

        actual_sample_ratio = sample_size / spectra_n
        ds_segments = define_ds_segments(
            sample_mzs, actual_sample_ratio, self._imzml_wrapper, ds_segm_size_mb=ds_segm_size_mb
        )

        ds_segments_path = self._ds_data_path / 'ds_segments'
        spectra_per_chunk_n = calculate_chunk_sp_n(
            sample_mzs.nbytes, sample_size, max_chunk_size_mb=500
        )
        segment_ds(self._imzml_wrapper, spectra_per_chunk_n, ds_segments, ds_segments_path)

        logger.info('Putting dataset segments to workers')
        self.put_segments_to_workers(ds_segments_path)

        return ds_segments

    def clip_and_segment_centroids(self, centroids_df, ds_segments, ds_dims):
        centr_df = clip_centroids_df(
            centroids_df, mz_min=ds_segments[0, 0], mz_max=ds_segments[-1, 1]
        )
        centr_segments_path = self._ds_data_path / 'centr_segments'
        centr_segm_n = calculate_centroids_segments_n(centr_df, ds_dims)
        segment_centroids(centr_df, centr_segm_n, centr_segments_path)

        logger.info('Putting centroids segments to workers')
        self.put_segments_to_workers(centr_segments_path)

        return centr_segm_n

    def select_target_formula_inds(
        self,
        ion_formula_map_df: pd.DataFrame,
        formulas_df: pd.DataFrame,
        target_modifiers: Set[str],
    ) -> Tuple[Set[int], Set[int]]:
        logger.info('Selecting target formula and targeted database formula indices')

        ion_formula_map_df = _left_merge(
            ion_formula_map_df,
            formulas_df.rename(columns={'formula': 'ion_formula'}).reset_index(),
            on='ion_formula',
        )

        target_ion_formula_map_df = ion_formula_map_df[
            ion_formula_map_df.modifier.isin(target_modifiers)
        ]
        target_formula_inds = set(target_ion_formula_map_df.formula_i)

        targeted_moldb_ids = {moldb.id for moldb in self._moldbs if moldb.targeted}
        targeted_database_ion_formula_map_df = target_ion_formula_map_df[
            target_ion_formula_map_df.moldb_id.isin(targeted_moldb_ids)
        ]
        targeted_database_formula_inds = set(targeted_database_ion_formula_map_df.formula_i)

        return target_formula_inds, targeted_database_formula_inds

    def search(self) -> Iterable[Tuple[pd.DataFrame, pyspark.RDD]]:
        """Search, score, and compute FDR for all MolecularDB formulas.

        Yields:
            tuple of (ion metrics, ion images)
        """
        logger.info('Running molecule search')

        ds_segments = self.define_segments_and_segment_ds(ds_segm_size_mb=20)
        self._perf.record_entry('segmented ds')

        moldb_fdr_list = init_fdr(self._ds_config, self._moldbs)
        ion_formula_map_df = collect_ion_formulas(self._spark_context, moldb_fdr_list)
        self._perf.record_entry('collected ion formulas')

        formula_centroids = self._fetch_formula_centroids(ion_formula_map_df)
        self._perf.record_entry('loaded centroids')
        centr_segm_n = self.clip_and_segment_centroids(
            centroids_df=formula_centroids.centroids_df(),
            ds_segments=ds_segments,
            ds_dims=(self._imzml_wrapper.h, self._imzml_wrapper.w),
        )
        self._perf.record_entry('segmented centroids')

        target_formula_inds, targeted_database_formula_inds = self.select_target_formula_inds(
            ion_formula_map_df,
            formula_centroids.formulas_df,
            target_modifiers=union_target_modifiers(moldb_fdr_list),
        )
        self._perf.add_extra_data(
            ds_segments=len(ds_segments),
            centr_segments=centr_segm_n,
            ion_formulas=len(ion_formula_map_df),
            target_formulas=len(target_formula_inds),
        )

        process_centr_segment = create_process_segment(
            ds_segments,
            self._imzml_wrapper.mask,
            self._imzml_wrapper.h,
            self._imzml_wrapper.w,
            self._ds_config,
            target_formula_inds,
            targeted_database_formula_inds,
        )
        results_rdd = self.process_segments(centr_segm_n, process_centr_segment)
        formula_metrics_df, formula_images_rdd = merge_results(
            results_rdd, formula_centroids.formulas_df
        )
        self.remove_spark_temp_files()

        for moldb, fdr in moldb_fdr_list:
            yield compute_fdr_and_filter_results(
                moldb, fdr, ion_formula_map_df, formula_metrics_df, formula_images_rdd
            )
