import logging
import pickle
from math import ceil
from shutil import rmtree

import numpy as np
import pandas as pd

from sm.engine.annotation.imzml_reader import FSImzMLReader
from sm.engine.errors import SMError

MAX_MZ_VALUE = 10 ** 5
MAX_INTENS_VALUE = 10 ** 12
ABS_MZ_TOLERANCE_DA = 0.002

SpIdxDType = np.uint32
IntensityDType = np.float32

logger = logging.getLogger('engine')


def check_spectra_quality(mz_arr, int_arr):
    err_msgs = []

    wrong_mz_n = mz_arr[(mz_arr < 0) | (mz_arr > MAX_MZ_VALUE)].shape[0]
    if wrong_mz_n > 0:
        err_msgs.append(
            'Sample mz arrays contain {} values outside of allowed range [0, {}]'.format(
                wrong_mz_n, MAX_MZ_VALUE
            )
        )

    wrong_int_n = mz_arr[(int_arr < 0) | (int_arr > MAX_INTENS_VALUE)].shape[0]
    if wrong_int_n > 0:
        err_msgs.append(
            'Sample intensity arrays contain {} values outside of allowed range [0, {}]'.format(
                wrong_int_n, MAX_INTENS_VALUE
            )
        )

    if err_msgs:
        raise SMError(' '.join(err_msgs))


def spectra_sample_gen(imzml_reader, sample_size):
    sample_sp_inds = np.random.choice(imzml_reader.n_spectra, sample_size, replace=False)
    for sp_idx, mzs, ints in imzml_reader.iter_spectra(sample_sp_inds):
        yield sp_idx, mzs, ints


def define_ds_segments(sample_mzs, sample_ratio, imzml_reader, ds_segm_size_mb=5):
    logger.info('Defining dataset segment bounds')
    sp_arr_row_size_b = (
        np.dtype(SpIdxDType).itemsize
        + np.dtype(imzml_reader.mz_precision).itemsize
        + np.dtype(IntensityDType).itemsize
    )
    total_mz_n = sample_mzs.shape[0] / sample_ratio  # pylint: disable=unsubscriptable-object
    sp_arr_total_size_mb = sp_arr_row_size_b * total_mz_n / 2 ** 20

    segm_n = round(sp_arr_total_size_mb / ds_segm_size_mb)
    segm_n = max(8, int(segm_n))

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_lower_bounds = np.quantile(sample_mzs, segm_bounds_q)
    ds_segments = np.array(list(zip(segm_lower_bounds[:-1], segm_lower_bounds[1:])))

    logger.info(
        f'Generated {len(ds_segments)} dataset segments: {ds_segments[0]}...{ds_segments[-1]}'
    )
    return ds_segments


def segment_spectra_chunk(sp_chunk_df, mz_segments, ds_segments_path):
    segm_left_bounds, segm_right_bounds = zip(*mz_segments)
    segm_starts = np.searchsorted(sp_chunk_df.mz.values, segm_left_bounds)
    segm_ends = np.searchsorted(sp_chunk_df.mz.values, segm_right_bounds)

    for segm_i, (start, end) in enumerate(zip(segm_starts, segm_ends)):
        segment_path = ds_segments_path / f'ds_segm_{segm_i:04}.pickle'
        with open(segment_path, 'ab') as f:
            pickle.dump(sp_chunk_df.iloc[start:end], f)


def calculate_chunk_sp_n(sample_mzs_bytes, sample_sp_n, max_chunk_size_mb=500):
    segm_arr_column_n = 3  # sp_idx, mzs, ints
    sample_spectra_size_mb = (
        sample_mzs_bytes * (segm_arr_column_n + 1) / 2 ** 20
    )  # +1 - sort arg copy of mzs
    spectrum_size_mb = sample_spectra_size_mb / sample_sp_n
    chunk_sp_n = int(max_chunk_size_mb / spectrum_size_mb)
    return max(1, chunk_sp_n)


def fetch_chunk_spectra_data(sp_ids, imzml_reader):
    sp_idxs_list, mzs_list, ints_list = [], [], []
    for sp_id, mzs_, ints_ in imzml_reader.iter_spectra(sp_ids):
        sp_idx = imzml_reader.pixel_indexes[sp_id]
        sp_idxs_list.append(np.ones_like(mzs_) * sp_idx)
        mzs_list.append(mzs_)
        ints_list.append(ints_)

    mzs = np.concatenate(mzs_list)
    # Mergesort is used for 2 reasons:
    # * It's much faster than the default quicksort, because m/z data is already partially sorted
    #   and the underlying "Timsort" implementation is optimized for partially-sorted data.
    # * It's a "stable sort", meaning it will preserve the ordering by spectrum index if mz values
    #   are equal. The order of pixels affects some metrics, so this stability is important.
    by_mz = np.argsort(mzs, kind='mergesort')
    sp_chunk_df = pd.DataFrame(
        {
            'sp_idx': np.concatenate(sp_idxs_list)[by_mz].astype(SpIdxDType),
            'mz': mzs[by_mz].astype(imzml_reader.mz_precision),
            'int': np.concatenate(ints_list)[by_mz].astype(IntensityDType),
        }
    )
    return sp_chunk_df


def chunk_list(xs, size):
    n = (len(xs) - 1) // size + 1
    for i in range(n):
        yield xs[size * i : size * (i + 1)]


def extend_ds_segment_bounds(ds_segments):
    """Extend boundaries of the first and last segments
    to include all mzs outside of the spectra sample mz range."""
    mz_segments = ds_segments.copy()
    mz_segments[0, 0] = 0
    mz_segments[-1, 1] = MAX_MZ_VALUE
    return mz_segments


def segment_ds(imzml_reader: FSImzMLReader, spectra_per_chunk_n, ds_segments, ds_segments_path):
    logger.info(f'Segmenting dataset into {len(ds_segments)} segments')

    rmtree(ds_segments_path, ignore_errors=True)
    ds_segments_path.mkdir(parents=True)

    mz_segments = extend_ds_segment_bounds(ds_segments)
    sp_id_chunks = chunk_list(xs=range(imzml_reader.n_spectra), size=spectra_per_chunk_n)
    for chunk_i, sp_ids in enumerate(sp_id_chunks, 1):
        logger.debug(f'Segmenting spectra chunk {chunk_i}')
        sp_chunk_df = fetch_chunk_spectra_data(sp_ids, imzml_reader)
        segment_spectra_chunk(sp_chunk_df, mz_segments, ds_segments_path)


def clip_centroids_df(centroids_df, mz_min, mz_max):
    ds_mz_range_unique_formulas = centroids_df[
        (mz_min < centroids_df.mz) & (centroids_df.mz < mz_max)
    ].index.unique()
    centr_df = (
        centroids_df[centroids_df.index.isin(ds_mz_range_unique_formulas)].reset_index().copy()
    )
    return centr_df


def calculate_centroids_segments_n(centr_df, image_dims):
    rows, cols = image_dims
    max_total_dense_images_size = 2 ** 30
    peaks_per_centr_segm = int(max_total_dense_images_size / (rows * cols * 8))
    centr_segm_n = max(16, ceil(centr_df.shape[0] / peaks_per_centr_segm))
    return centr_segm_n


def segment_centroids(centr_df, centr_segm_n, centr_segm_path):
    logger.info(f'Segmenting centroids into {centr_segm_n} segments')

    rmtree(centr_segm_path, ignore_errors=True)
    centr_segm_path.mkdir(parents=True)

    first_peak_df = centr_df[centr_df.peak_i == 0].copy()
    segm_bounds_q = [i * 1 / centr_segm_n for i in range(0, centr_segm_n)]
    segm_lower_bounds = list(np.quantile(first_peak_df.mz, q) for q in segm_bounds_q)

    segment_mapping = np.searchsorted(segm_lower_bounds, first_peak_df.mz.values, side='right') - 1
    first_peak_df['segm_i'] = segment_mapping

    centr_segm_df = pd.merge(
        centr_df, first_peak_df[['formula_i', 'segm_i']], on='formula_i'
    ).sort_values('mz')
    for segm_i, df in centr_segm_df.groupby('segm_i'):
        segment_path = centr_segm_path / f'centr_segm_{segm_i:04}.pickle'
        with open(segment_path, 'wb') as f:
            pickle.dump(df, f)
