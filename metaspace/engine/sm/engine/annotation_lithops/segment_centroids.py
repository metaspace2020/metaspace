from __future__ import annotations

import logging
import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Tuple

import numpy as np
import pandas as pd
from lithops.storage.utils import CloudObject

from sm.engine.annotation_lithops.annotate import choose_ds_segments
from sm.engine.annotation_lithops.calculate_centroids import validate_formulas_not_in_multiple_segms
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    CObj,
    save_cobj,
    load_cobj,
    load_cobjs,
)
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper

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
        max(ds_size_mb // data_per_centr_segm_mb, centr_n // peaks_per_centr_segm, 32)
    )

    segm_bounds_q = [i * 1 / centr_segm_n for i in range(0, centr_segm_n)]
    centr_segm_lower_bounds = np.quantile(first_peak_df_mz, segm_bounds_q)

    logger.info(
        f'Generated {len(centr_segm_lower_bounds)} centroids bounds: '
        f'{centr_segm_lower_bounds[0]}...{centr_segm_lower_bounds[-1]}'
    )
    return centr_segm_lower_bounds


def segment_centroids(
    fexec: Executor,
    peaks_cobjs: List[CObj[pd.DataFrame]],
    ds_segms_cobjs: List[CObj[pd.DataFrame]],
    ds_segms_bounds: np.ndarray,
    ds_segm_size_mb: int,
    is_intensive_dataset: bool,
    isocalc_wrapper: IsocalcWrapper,
) -> List[CObj[pd.DataFrame]]:
    # pylint: disable=too-many-locals,too-many-statements
    max_ds_segms_size_per_db_segm_mb = 2560 if is_intensive_dataset else 1536
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

    def merge_centr_df_segments(idx, segm_cobjs, *, storage):
        def _second_level_segment(segm, sub_segms_n):
            segm_bounds_q = [i * 1 / sub_segms_n for i in range(0, sub_segms_n)]
            sub_segms_lower_bounds = np.quantile(segm[segm.peak_i == 0].mz.values, segm_bounds_q)
            centr_segm_df = segment_centr_df(segm, sub_segms_lower_bounds)

            sub_segms = []
            for _, df in centr_segm_df.groupby('segm_i'):
                del df['segm_i']
                sub_segms.append(df)
            return sub_segms

        print(f'Merging segment {idx} clipped centroids chunks')
        segm = pd.concat(load_cobjs(storage, segm_cobjs))
        init_segms = _second_level_segment(segm, len(centr_segm_lower_bounds[idx]))

        segms = []
        for init_segm in init_segms:
            first_ds_segm_i, last_ds_segm_i = choose_ds_segments(
                ds_segms_bounds, init_segm, isocalc_wrapper
            )
            ds_segms_to_download_n = last_ds_segm_i - first_ds_segm_i + 1
            segms.append((ds_segms_to_download_n, init_segm))
        segms = sorted(segms, key=lambda x: x[0], reverse=True)
        max_ds_segms_to_download_n, max_segm = segms[0]

        max_iterations_n = 100
        iterations_n = 1
        while (
            max_ds_segms_to_download_n * ds_segm_size_mb > max_ds_segms_size_per_db_segm_mb
            and iterations_n < max_iterations_n
        ):

            sub_segms = []
            sub_segms_n = math.ceil(
                max_ds_segms_to_download_n * ds_segm_size_mb / max_ds_segms_size_per_db_segm_mb
            )
            for sub_segm in _second_level_segment(max_segm, sub_segms_n):
                first_ds_segm_i, last_ds_segm_i = choose_ds_segments(
                    ds_segms_bounds, sub_segm, isocalc_wrapper
                )
                ds_segms_to_download_n = last_ds_segm_i - first_ds_segm_i + 1
                sub_segms.append((ds_segms_to_download_n, sub_segm))

            segms = sub_segms + segms[1:]
            segms = sorted(segms, key=lambda x: x[0], reverse=True)
            iterations_n += 1
            max_ds_segms_to_download_n, max_segm = segms[0]

        def _second_level_upload(df):
            return save_cobj(storage, df)

        print(f'Storing {len(segms)} centroids segments')
        with ThreadPoolExecutor(max_workers=128) as pool:
            segms = [df for _, df in segms]
            segms_cobjs = list(pool.map(_second_level_upload, segms))

        return segms_cobjs

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
        if df:
            logger.warning(df)

    def get_segm_stats(storage, segm_cobject):
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
                    .peak_i.apply(lambda peak_is: len(set(range(len(peak_is))) - set(peak_is)))
                    .sum()
                ),
                'is_sorted': segm.mz.is_monotonic,
                'n_formulas': segm.formula_i.nunique(),
            }
        )
        return formula_is, stats

    warnings = []

    segm_formula_is, stats = fexec.map_unpack(get_segm_stats, db_segms_cobjs, runtime_memory=1024)
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
