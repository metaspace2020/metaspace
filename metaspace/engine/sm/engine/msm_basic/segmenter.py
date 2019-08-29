import logging
from math import ceil
from shutil import rmtree
from collections import defaultdict

import pandas as pd
import numpy as np

from sm.engine.errors import SMError
from sm.engine.msm_basic.formula_imager import get_pixel_indices

MAX_MZ_VALUE = 10 ** 5
MAX_INTENS_VALUE = 10 ** 12
ABS_MZ_TOLERANCE_DA = 0.002

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


def spectra_sample_gen(imzml_parser, sample_ratio=0.05):
    sp_n = len(imzml_parser.coordinates)
    sample_size = int(sp_n * sample_ratio)
    sample_sp_inds = np.random.choice(np.arange(sp_n), sample_size)
    for sp_idx in sample_sp_inds:
        mzs, ints = imzml_parser.getspectrum(sp_idx)
        yield sp_idx, mzs, ints


def define_ds_segments(sample_mzs, total_mz_n, mz_precision, ds_segm_size_mb=5):
    logger.info(f'Defining dataset segment bounds')

    float_prec = 4 if mz_precision == 'f' else 8
    segm_arr_column_n = 3  # sp_idx, mzs, ints
    segm_n = segm_arr_column_n * (total_mz_n * float_prec) // (ds_segm_size_mb * 2 ** 20)
    segm_n = max(1, int(segm_n))

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_lower_bounds = np.quantile(sample_mzs, segm_bounds_q)
    ds_segments = np.array(list(zip(segm_lower_bounds[:-1], segm_lower_bounds[1:])))

    logger.info(
        f'Generated {len(ds_segments)} dataset segments: {ds_segments[0]}...{ds_segments[-1]}'
    )
    return ds_segments


def segment_spectra_chunk(sp_data, dtype, mz_segments, ds_segments_path):
    mzs = np.concatenate(sp_data['mzs'])
    by_mz = np.argsort(mzs)
    sp_mz_int_buf = np.array(
        [
            np.concatenate(sp_data['sp_inds'])[by_mz],
            mzs[by_mz],
            np.concatenate(sp_data['sp_inds'])[by_mz],
        ],
        dtype,
    ).T

    segm_left_bounds, segm_right_bounds = zip(*mz_segments)

    segm_starts = np.searchsorted(
        sp_mz_int_buf[:, 1], segm_left_bounds
    )  # mz expected to be in column 1
    segm_ends = np.searchsorted(sp_mz_int_buf[:, 1], segm_right_bounds)

    for segm_i, (start, end) in enumerate(zip(segm_starts, segm_ends)):
        pd.to_msgpack(
            ds_segments_path / f'ds_segm_{segm_i:04}.msgpack', sp_mz_int_buf[start:end], append=True
        )


def calculate_chunk_sp_n(sample_mzs_bytes, sample_sp_n, max_chunk_size_mb=500):
    segm_arr_column_n = 3  # sp_idx, mzs, ints
    sample_spectra_size_mb = (
        sample_mzs_bytes * (segm_arr_column_n + 1) / 2 ** 20
    )  # +1 - sort arg copy of mzs
    spectrum_size_mb = sample_spectra_size_mb / sample_sp_n
    chunk_sp_n = int(max_chunk_size_mb / spectrum_size_mb)
    return max(1, chunk_sp_n)


def segment_ds(imzml_parser, coordinates, chunk_sp_n, ds_segments, ds_segments_path):
    logger.info(f'Segmenting dataset into {len(ds_segments)} segments')

    rmtree(ds_segments_path, ignore_errors=True)
    ds_segments_path.mkdir(parents=True)

    # extend boundaries of the first and last segments
    # to include all mzs outside of the spectra sample mz range
    mz_segments = ds_segments.copy()
    mz_segments[0, 0] = 0
    mz_segments[-1, 1] = MAX_MZ_VALUE

    def chunk_list(xs, size):
        n = (len(xs) - 1) // size + 1
        for i in range(n):
            yield xs[size * i : size * (i + 1)]

    sp_data = defaultdict(list)
    sp_id_to_idx = get_pixel_indices(coordinates)

    def update_spectra_data(sp_ids):
        for sp_id in sp_ids:
            mzs, ints = imzml_parser.getspectrum(sp_id)
            mzs, ints = map(np.array, [mzs, ints])
            sp_idx = sp_id_to_idx[sp_id]
            sp_data['sp_inds'].append(np.ones_like(mzs) * sp_idx)
            sp_data['mzs'].append(mzs)
            sp_data['ints'].append(ints)

    sp_id_chunks = list(chunk_list(range(len(coordinates)), chunk_sp_n))
    for ch_i, sp_ids in enumerate(sp_id_chunks):
        logger.debug(f'Segmenting spectra chunk {ch_i+1}/{len(sp_id_chunks)}')
        update_spectra_data(sp_ids)
        segment_spectra_chunk(sp_data, imzml_parser.mzPrecision, mz_segments, ds_segments_path)
        sp_data = defaultdict(list)


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
    max_total_dense_images_size = 5 * 2 ** 30
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
        pd.to_msgpack(f'{centr_segm_path}/centr_segm_{segm_i:04}.msgpack', df)
