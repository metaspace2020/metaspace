from __future__ import annotations

import logging
from itertools import chain
from typing import List

import numpy as np
import pandas as pd
from lithops.storage import Storage

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, load_cobj, CObj, load_cobjs, save_cobjs
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('annotation-pipeline')


def calculate_centroids(
    fexec: Executor, formula_cobjs: List[CObj[pd.DataFrame]], isocalc_wrapper: IsocalcWrapper
) -> List[CObj[pd.DataFrame]]:
    def calculate_peaks_for_formula(args):
        formula_i, formula, target, targeted = args
        mzs, ints = isocalc_wrapper.centroids(formula)
        if mzs is not None:
            return [
                (formula_i, peak_i, mzs[peak_i], ints[peak_i], target, targeted)
                for peak_i in range(len(mzs))
            ]
        return []

    def calculate_peaks_chunk(segm_i: int, segm_cobject: CObj[pd.DataFrame], *, storage: Storage):
        print(f'Calculating peaks from formulas chunk {segm_i}')
        chunk_df = load_cobj(storage, segm_cobject)
        chunk_iter = chunk_df[['ion_formula', 'target', 'targeted']].itertuples(True, None)
        peaks = list(chain(*map(calculate_peaks_for_formula, chunk_iter)))
        peaks_df = pd.DataFrame(
            peaks, columns=['formula_i', 'peak_i', 'mz', 'int', 'target', 'targeted']
        )
        peaks_df = peaks_df.astype(
            {
                'formula_i': 'u4',
                'peak_i': 'u1',
                'mz': 'f8',
                'int': 'f4',
                'target': '?',
                'targeted': '?',
            }
        )

        peaks_df.set_index('formula_i', inplace=True)

        print(f'Storing centroids chunk {segm_i}')
        peaks_cobject = save_cobj(storage, peaks_df)

        return peaks_cobject, peaks_df.shape[0]

    peaks_cobjs, peaks_cobject_lens = fexec.map_unpack(
        calculate_peaks_chunk,
        list(enumerate(formula_cobjs)),
        runtime_memory=2048,
    )

    num_centroids = sum(peaks_cobject_lens)
    logger.info(f'Calculated {num_centroids} centroids in {len(peaks_cobjs)} chunks')

    def _sort_peaks_cobjs(*, storage):
        df = pd.concat(load_cobjs(storage, peaks_cobjs))
        first_peak_mz = df.mz[df.peak_i == 0].sort_values()

        peaks_chunk_size = 64 * 2 ** 20
        n_chunks = int(np.ceil(df.memory_usage().sum() / peaks_chunk_size))
        cnt = len(first_peak_mz)
        chunks = (
            df.loc[first_peak_mz.index[cnt * i // n_chunks : cnt * (i + 1) // n_chunks]]
            for i in range(n_chunks)
        )

        return save_cobjs(storage, chunks)

    sorted_peaks_cobjs = fexec.call(
        _sort_peaks_cobjs,
        (),
        cost_factors={'num_centroids': num_centroids, 'num_peak_cobjects': len(peaks_cobjs)},
        runtime_memory=256 + 100 * num_centroids / 2 ** 20,
    )

    logger.info(f'Sorted centroids chunks into {len(sorted_peaks_cobjs)} chunks')
    return sorted_peaks_cobjs


def validate_centroids(fexec: Executor, peaks_cobjs: List[CObj[pd.DataFrame]]):
    # Ignore code duplicated with validate_centroid_segments as the duplicated parts of the code
    # are too entangled with non-duplicated parts of the code

    def warn(message, df=None):
        warnings.append(message)
        logger.warning(message)
        if df:
            logger.warning(df)

    def get_segm_stats(segm_cobject: CObj[pd.DataFrame], *, storage: Storage):
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

    warnings: List[str] = []
    results = fexec.map(get_segm_stats, [(co,) for co in peaks_cobjs], runtime_memory=1024)
    segm_formula_is = [formula_is for formula_is, stats in results]
    stats_df = pd.DataFrame([stats for formula_is, stats in results])

    with pd.option_context(
        'display.max_rows', None, 'display.max_columns', None, 'display.width', 1000
    ):
        # Report cases with fewer peaks than expected (indication that formulas are being
        # split between multiple segments)
        wrong_n_peaks = stats_df[
            (stats_df.avg_n_peaks < 3.9) | (stats_df.min_n_peaks < 2) | (stats_df.max_n_peaks > 4)
        ]
        if not wrong_n_peaks.empty:
            warn(
                'segment_centroids produced segments with unexpected peaks-per-formula '
                '(should be almost always 4, occasionally 2 or 3):',
                wrong_n_peaks,
            )

        # Report missing peaks
        missing_peaks = stats_df[stats_df.missing_peaks > 0]
        if not missing_peaks.empty:
            warn('segment_centroids produced segments with missing peaks:', missing_peaks)

        formula_in_segms_df = validate_formulas_not_in_multiple_segms(segm_formula_is, warn)

        logger.debug(
            f'Found {stats_df.n_peaks.sum()} peaks for {stats_df.n_formulas.sum()} formulas '
            f'across {len(peaks_cobjs)} segms'
        )
        n_per_segm = formula_in_segms_df.groupby('segm_i').formula_i.count()
        logger.debug(f'Segm sizes range from {n_per_segm.min()} to {n_per_segm.max()}')

        if warnings:
            try:
                __import__('__main__').stats_df = stats_df
                print('validate_centroids debug info written to "stats_df" variable')
            except Exception:
                pass

            raise AssertionError('Some checks failed in validate_centroids')


def validate_formulas_not_in_multiple_segms(segm_formula_is, warn):
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
    if not formulas_in_multiple_segms_df.empty:
        warn(
            'found the same formula in multiple segments:',
            formulas_in_multiple_segms_df,
        )
    return formula_in_segms_df
