from __future__ import annotations

import logging
from itertools import repeat
from typing import List

import pandas as pd
from lithops.storage.utils import CloudObject

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, load_cobj, CObj
from sm.engine.ds_config import DSConfig

logger = logging.getLogger('annotation-pipeline')


def calculate_centroids(
    fexec: Executor, formula_cobjects: List[CloudObject], ds_config: DSConfig
) -> List[CObj[pd.DataFrame]]:
    def calculate_peaks_for_formula(formula_i, formula):
        mzs, ints = isocalc_wrapper.centroids(formula)
        if mzs is not None:
            return list(zip(repeat(formula_i), range(len(mzs)), mzs, ints))
        else:
            return []

    def calculate_peaks_chunk(segm_i, segm_cobject, storage):
        print(f'Calculating peaks from formulas chunk {segm_i}')
        chunk_df = load_cobj(storage, segm_cobject)
        peaks = [
            peak
            for formula_i, formula in chunk_df.items()
            for peak in calculate_peaks_for_formula(formula_i, formula)
        ]
        peaks_df = pd.DataFrame(peaks, columns=['formula_i', 'peak_i', 'mz', 'int'])
        peaks_df.set_index('formula_i', inplace=True)

        print(f'Storing centroids chunk {id}')
        peaks_cobject = save_cobj(storage, peaks_df)

        return peaks_cobject, peaks_df.shape[0]

    from sm.engine.isocalc_wrapper import (
        IsocalcWrapper,
    )  # Import lazily so that the rest of the pipeline still works if the dependency is missing

    isocalc_wrapper = IsocalcWrapper(ds_config)

    memory_capacity_mb = 2048
    results = fexec.map(
        calculate_peaks_chunk, list(enumerate(formula_cobjects)), runtime_memory=memory_capacity_mb
    )

    num_centroids = sum(count for cobj, count in results)
    n_centroids_chunks = len(results)
    peaks_cobjects = [cobj for cobj, count in results]
    logger.info(f'Calculated {num_centroids} centroids in {n_centroids_chunks} chunks')
    return peaks_cobjects


def validate_centroids(fexec: Executor, peaks_cobjects: List[CloudObject]):
    def get_segm_stats(storage, segm_cobject):
        segm = load_cobj(storage, segm_cobject)
        n_peaks = segm.groupby(level='formula_i').peak_i.count()
        formula_is = segm.index.unique()
        stats = pd.Series(
            {
                'min_mz': segm.mz.min(),
                'max_mz': segm.mz.max(),
                'min_formula_i': segm.index.min(),
                'max_formula_i': segm.index.max(),
                'avg_n_peaks': n_peaks.mean(),
                'min_n_peaks': n_peaks.min(),
                'max_n_peaks': n_peaks.max(),
                'max_int': segm.int.max(),
                'missing_peaks': (
                    segm.loc[n_peaks.index[n_peaks != 4]]
                    .groupby(level='formula_i')
                    .peak_i.apply(lambda peak_is: len(set(range(len(peak_is))) - set(peak_is)))
                    .sum()
                ),
                'n_formulas': len(formula_is),
                'n_peaks': len(segm),
            }
        )
        return formula_is, stats

    results = fexec.map(get_segm_stats, peaks_cobjects, runtime_memory=1024)
    segm_formula_is = [formula_is for formula_is, stats in results]
    stats_df = pd.DataFrame([stats for formula_is, stats in results])

    try:
        __import__('__main__').peaks_cobjects = stats_df
        logger.info('validate_peaks_cobjects debug info written to "peaks_cobjects" variable')
    except Exception:
        pass

    with pd.option_context(
        'display.max_rows', None, 'display.max_columns', None, 'display.width', 1000
    ):
        # Report cases with fewer peaks than expected (indication that formulas are being split between multiple segments)
        wrong_n_peaks = stats_df[
            (stats_df.avg_n_peaks < 3.9) | (stats_df.min_n_peaks < 2) | (stats_df.max_n_peaks > 4)
        ]
        if not wrong_n_peaks.empty:
            logger.warning(
                'segment_centroids produced segments with unexpected peaks-per-formula (should be almost always 4, occasionally 2 or 3):'
            )
            logger.warning(wrong_n_peaks)

        # Report missing peaks
        missing_peaks = stats_df[stats_df.missing_peaks > 0]
        if not missing_peaks.empty:
            logger.warning('segment_centroids produced segments with missing peaks:')
            logger.warning(missing_peaks)

    formula_in_segms_df = pd.DataFrame(
        [
            (formula_i, segm_i)
            for segm_i, formula_is in enumerate(segm_formula_is)
            for formula_i in formula_is
        ],
        columns=['formula_i', 'segm_i'],
    )
    formulas_in_multiple_segms = (formula_in_segms_df.groupby('formula_i').segm_i.count() > 1)[
        lambda s: s
    ].index
    formulas_in_multiple_segms_df = formula_in_segms_df[
        lambda df: df.formula_i.isin(formulas_in_multiple_segms)
    ].sort_values('formula_i')

    n_per_segm = formula_in_segms_df.groupby('segm_i').formula_i.count()
    if not formulas_in_multiple_segms_df.empty:
        logger.warning('segment_centroids produced put the same formula in multiple segments:')
        logger.warning(formulas_in_multiple_segms_df)

    print(
        f'Found {stats_df.n_peaks.sum()} peaks for {stats_df.n_formulas.sum()} formulas across {len(peaks_cobjects)} segms'
    )
    print(f'Segm sizes range from {n_per_segm.min()} to {n_per_segm.max()}')
