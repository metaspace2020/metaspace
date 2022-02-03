from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Tuple

import numpy as np
import pandas as pd
from lithops.storage.utils import CloudObject

from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.annotation_lithops.annotate import choose_ds_segments
from sm.engine.annotation_lithops.calculate_centroids import validate_formulas_not_in_multiple_segms
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    CObj,
    save_cobj,
    load_cobj,
    load_cobjs,
)

MIN_CENTR_SEGMS = 32

logger = logging.getLogger('annotation-pipeline')
MAX_MZ_VALUE = 10 ** 5


def clip_centr_df(
    fexec: Executor, peaks_cobjs: List[CloudObject], mz_min: float, mz_max: float
) -> Tuple[List[CObj[pd.DataFrame]], int]:
    def clip_centr_df_chunk(peaks_i, peaks_cobject, storage):
        print(f'Clipping centroids dataframe chunk {peaks_i}')
        centroids_df_chunk = load_cobj(storage, peaks_cobject).sort_values('mz')
        centroids_df_chunk = centroids_df_chunk[centroids_df_chunk.mz > 0]

        ds_mz_range_unique_formulas = centroids_df_chunk[
            (mz_min < centroids_df_chunk.mz) & (centroids_df_chunk.mz < mz_max)
        ].index.unique()
        centr_df_chunk = centroids_df_chunk[
            centroids_df_chunk.index.isin(ds_mz_range_unique_formulas)
        ].reset_index()
        clip_centr_chunk_cobject = save_cobj(storage, centr_df_chunk)

        return clip_centr_chunk_cobject, centr_df_chunk.shape[0]

    assert len(peaks_cobjs) > 0
    clip_centr_chunks_cobjs, centr_n = fexec.map_unpack(
        clip_centr_df_chunk,
        list(enumerate(peaks_cobjs)),
        runtime_memory=512,
    )

    clip_centr_chunks_cobjs = list(clip_centr_chunks_cobjs)
    centr_n = sum(centr_n)
    logger.info(f'Prepared {centr_n} centroids')
    return clip_centr_chunks_cobjs, centr_n


def define_centr_segments(
    fexec: Executor,
    clip_centr_chunks_cobjs: List[CloudObject],
    centr_n: int,
    ds_size_mb: int,
):
    logger.info('Defining centroids segments bounds')

    def get_first_peak_mz(idx, cobject, *, storage):
        print(f'Extracting first peak mz values from clipped centroids dataframe {idx}')
        centr_df = load_cobj(storage, cobject)
        first_peak_df = centr_df[centr_df.peak_i == 0]
        return first_peak_df.mz.values

    first_peak_df_mz = np.concatenate(
        fexec.map(get_first_peak_mz, list(enumerate(clip_centr_chunks_cobjs)), runtime_memory=512)
    )

    data_per_centr_segm_mb = 50
    peaks_per_centr_segm = 10000
    centr_segm_n = int(
        max(ds_size_mb // data_per_centr_segm_mb, centr_n // peaks_per_centr_segm, MIN_CENTR_SEGMS)
    )

    segm_bounds_q = [i * 1 / centr_segm_n for i in range(0, centr_segm_n)]
    centr_segm_lower_bounds = np.quantile(first_peak_df_mz, segm_bounds_q)

    logger.info(
        f'Generated {len(centr_segm_lower_bounds)} centroids bounds: '
        f'{centr_segm_lower_bounds[0]}...{centr_segm_lower_bounds[-1]}'
    )
    return centr_segm_lower_bounds


def choose_ds_segments_per_formula(ds_segments_bounds, centr_df, isocalc_wrapper):
    centr_min_mz, centr_max_mz = isocalc_wrapper.mass_accuracy_bounds(centr_df.mz)
    print(np.min(centr_min_mz), np.max(centr_max_mz))
    lo_segm_i = np.searchsorted(ds_segments_bounds[:, 0], centr_min_mz, side='right') - 1
    hi_segm_i = np.searchsorted(ds_segments_bounds[:, 1], centr_max_mz, side='left')
    segm_i_df = (
        pd.DataFrame({'formula_i': centr_df.index, 'lo': lo_segm_i, 'hi': hi_segm_i})
        .groupby('formula_i')
        .agg({'formula_i': 'first', 'lo': 'min', 'hi': 'max'})
        .sort_values(['hi', 'lo'], ignore_index=True)
    )
    return segm_i_df


def segment_centroids(
    fexec: Executor,
    peaks_cobjs: List[CObj[pd.DataFrame]],
    ds_segms_cobjs: List[CObj[pd.DataFrame]],
    ds_segms_bounds: np.ndarray,
    ds_segm_size_mb: int,
    is_intensive_dataset: bool,
    isocalc_wrapper: IsocalcWrapper,
) -> List[CObj[pd.DataFrame]]:
    # pylint: disable=too-many-locals
    mz_min, mz_max = ds_segms_bounds[0, 0], ds_segms_bounds[-1, 1]

    clip_centr_chunks_cobjs, centr_n = clip_centr_df(fexec, peaks_cobjs, mz_min, mz_max)

    # define first level segmentation and then segment each one into desired number

    centr_segm_lower_bounds = define_centr_segments(
        fexec,
        clip_centr_chunks_cobjs,
        centr_n,
        len(ds_segms_cobjs) * ds_segm_size_mb,
    )
    first_level_centr_segm_n = min(32, len(centr_segm_lower_bounds))
    centr_segm_lower_bounds = np.array_split(centr_segm_lower_bounds, first_level_centr_segm_n)
    first_level_centr_segm_bounds = np.array([bounds[0] for bounds in centr_segm_lower_bounds])

    def segment_centr_df(centr_df, db_segm_lower_bounds):
        first_peak_df = centr_df[centr_df.peak_i == 0].copy()
        segment_mapping = (
            np.searchsorted(db_segm_lower_bounds, first_peak_df.mz.values, side='right') - 1
        )
        first_peak_df['segm_i'] = segment_mapping
        centr_segm_df = pd.merge(
            centr_df, first_peak_df[['formula_i', 'segm_i']], on='formula_i'
        ).sort_values('mz')
        return centr_segm_df

    def segment_centr_chunk(idx, cobject, *, storage):
        print(f'Segmenting clipped centroids dataframe chunk {idx}')
        centr_df = load_cobj(storage, cobject)
        centr_segm_df = segment_centr_df(centr_df, first_level_centr_segm_bounds)

        def _first_level_upload(args):
            segm_i, df = args
            del df['segm_i']
            return segm_i, save_cobj(storage, df)

        with ThreadPoolExecutor(max_workers=128) as pool:
            sub_segms = list(centr_segm_df.groupby('segm_i'))
            sub_segms_cobjs = list(pool.map(_first_level_upload, sub_segms))

        return dict(sub_segms_cobjs)

    first_level_segms_cobjs = fexec.map(
        segment_centr_chunk, list(enumerate(clip_centr_chunks_cobjs)), runtime_memory=1024
    )

    def merge_centr_df_segments(segm_i, segm_cobjects, *, storage):
        print(f'Merging segment {segm_i} clipped centroids chunks')
        # Temporarily index by formula_i for faster filtering when saving
        segm = pd.concat(load_cobjs(storage, segm_cobjects)).set_index('formula_i')
        formula_segms_df = choose_ds_segments_per_formula(ds_segms_bounds, segm, isocalc_wrapper)

        # Try to balance formulas so that they all span roughly the same number of DS segments,
        # and have roughly the same number of formulas.
        max_segm_span = max((formula_segms_df.hi - formula_segms_df.lo).max(), 3)
        if is_intensive_dataset:
            max_segm_count = int(round(np.clip(centr_n / 1000, 1000, 5000)))
        else:
            max_segm_count = int(round(np.clip(centr_n / 1000, 1000, 15000)))
        formula_i_groups = []
        segm_lo_idx = 0
        while segm_lo_idx < len(formula_segms_df):
            max_segm_hi = formula_segms_df.lo[segm_lo_idx] + max_segm_span + 1
            max_span_idx = np.searchsorted(formula_segms_df.hi, max_segm_hi, 'left')
            segm_hi_idx = min(segm_lo_idx + max_segm_count, max_span_idx, len(formula_segms_df))
            formula_i_groups.append(formula_segms_df.formula_i.values[segm_lo_idx:segm_hi_idx])
            print(segm_lo_idx, segm_hi_idx)
            segm_lo_idx = segm_hi_idx

        def _second_level_upload(formula_is):
            return save_cobj(storage, segm.loc[formula_is].sort_values('mz').reset_index())

        print(f'Storing {len(formula_i_groups)} centroids segments')
        with ThreadPoolExecutor(max_workers=4) as pool:
            segms_cobjects = list(pool.map(_second_level_upload, formula_i_groups))

        return segms_cobjects

    second_level_segms_dict = defaultdict(list)
    for sub_segms_cobjs in first_level_segms_cobjs:
        for first_level_segm_i in sub_segms_cobjs:
            second_level_segms_dict[first_level_segm_i].append(sub_segms_cobjs[first_level_segm_i])
    second_level_segms_cobjs = sorted(second_level_segms_dict.items(), key=lambda x: x[0])

    first_level_cobjs = [co for cos in first_level_segms_cobjs for co in cos.values()]

    db_segms_cobjs = fexec.map_concat(
        merge_centr_df_segments, second_level_segms_cobjs, runtime_memory=512
    )

    fexec.storage.delete_cloudobjects(first_level_cobjs)

    return db_segms_cobjs


def validate_centroid_segments(fexec, db_segms_cobjs, ds_segms_bounds, isocalc_wrapper):
    def warn(message, df=None):
        warnings.append(message)
        logger.warning(message)
        if df is not None:
            logger.warning(df)

    def get_segm_stats(segm_cobject, *, storage):
        segm = load_cobj(storage, segm_cobject)
        mzs = np.sort(segm.mz.values)
        ds_segm_lo, ds_segm_hi = choose_ds_segments(ds_segms_bounds, segm, isocalc_wrapper)
        n_peaks = segm.groupby('formula_i').peak_i.count()
        formula_is = segm.formula_i.unique()
        stats = pd.Series(
            {
                'min_mz': mzs[0],
                'max_mz': mzs[-1],
                'mz_span': mzs[-1] - mzs[0],
                'n_ds_segms': ds_segm_hi - ds_segm_lo + 1,
                'biggest_gap': (mzs[1:] - mzs[:-1]).max(),
                'avg_n_peaks': n_peaks.mean(),
                'min_n_peaks': n_peaks.min(),
                'max_n_peaks': n_peaks.max(),
                'missing_peaks': (
                    segm[segm.formula_i.isin(n_peaks.index[n_peaks != 4])]
                    .groupby('formula_i')
                    .peak_i.apply(lambda peak_is: len(set(range(max(peak_is))) - set(peak_is)))
                    .sum()
                ),
                'is_sorted': segm.mz.is_monotonic,
                'n_formulas': segm.formula_i.nunique(),
            }
        )
        return formula_is, stats

    warnings = []

    args = [(cobj,) for cobj in db_segms_cobjs]
    segm_formula_is, stats = fexec.map_unpack(get_segm_stats, args, runtime_memory=1024)
    stats_df = pd.DataFrame(stats)

    with pd.option_context(
        'display.max_rows', None, 'display.max_columns', None, 'display.width', 1000
    ):
        # Report large/sparse segments (indication that formulas have not been but in the
        # right segment)
        large_or_sparse = stats_df[
            ((stats_df.mz_span > 15) | (stats_df.biggest_gap > 2)) & (stats_df.n_ds_segms > 2)
        ]
        if not large_or_sparse.empty:
            warn('segment_centroids produced unexpectedly large/sparse segments', large_or_sparse)

        # Report cases with fewer peaks than expected (indication that formulas are being split
        # between multiple segments)
        wrong_n_peaks = stats_df[
            (stats_df.avg_n_peaks < 3.5) | (stats_df.min_n_peaks < 2) | (stats_df.max_n_peaks > 4)
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

        # Report unsorted segments
        unsorted = stats_df[~stats_df.is_sorted]
        if not unsorted.empty:
            warn('segment_centroids produced unsorted segments:', unsorted)

    validate_formulas_not_in_multiple_segms(segm_formula_is, warn)

    if warnings:
        try:
            __import__('__main__').stats_df = stats_df
            print('validate_segment_centroids debug info written to "stats_df" variable')
        except Exception:
            pass

        raise AssertionError('Some checks failed in validate_centroids')
