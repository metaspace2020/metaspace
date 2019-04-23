import logging
from collections import defaultdict
from shutil import rmtree
import pandas as pd
import numpy as np

from sm.engine.errors import JobFailedError
from sm.engine.msm_basic.formula_imager import determine_spectra_order

MAX_MZ_VALUE = 10**5
MAX_INTENS_VALUE = 10**12
ABS_MZ_TOLERANCE_DA = 0.002

logger = logging.getLogger('engine')


def check_spectra_quality(spectra_sample):
    err_msgs = []

    mz_arr = np.concatenate([sp[1] for sp in spectra_sample])
    wrong_mz_n = mz_arr[(mz_arr < 0) | (mz_arr > MAX_MZ_VALUE)].shape[0]
    if wrong_mz_n > 0:
        err_msgs.append('Sample mz arrays contain {} values outside of allowed range [0, {}]'\
                        .format(wrong_mz_n, MAX_MZ_VALUE))

    int_arr = np.concatenate([sp[2] for sp in spectra_sample])
    wrong_int_n = mz_arr[(int_arr < 0) | (int_arr > MAX_INTENS_VALUE)].shape[0]
    if wrong_int_n > 0:
        err_msgs.append('Sample intensity arrays contain {} values outside of allowed range [0, {}]'\
                        .format(wrong_int_n, MAX_INTENS_VALUE))

    if len(err_msgs) > 0:
        raise JobFailedError(' '.join(err_msgs))


def spectra_sample_gen(imzml_parser, sample_ratio=0.05):
    sp_n = len(imzml_parser.coordinates)
    sample_size = int(sp_n * sample_ratio)
    sample_sp_inds = np.random.choice(np.arange(sp_n), sample_size)
    for sp_idx in sample_sp_inds:
        mzs, ints = imzml_parser.getspectrum(sp_idx)
        yield sp_idx, mzs, ints


def define_ds_segments(imzml_parser, sample_ratio=0.05, ds_segm_size_mb=5):
    spectra_sample = spectra_sample_gen(imzml_parser, sample_ratio=sample_ratio)

    spectra_mzs = np.array([mz for sp_id, mzs, ints in spectra_sample for mz in mzs])
    n_mz = spectra_mzs.shape[0]
    total_n_mz = n_mz / sample_ratio

    float_prec = 8  # double precision
    segm_arr_columns = 3
    segm_n = segm_arr_columns * (total_n_mz * float_prec) // (ds_segm_size_mb * 2**20)
    segm_n = max(1, int(segm_n))

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_lower_bounds = [np.quantile(spectra_mzs, q) for q in segm_bounds_q]
    ds_segments = np.array(list(zip(segm_lower_bounds[:-1], segm_lower_bounds[1:])))

    logger.info(f'Generated {len(ds_segments)} dataset segments: {ds_segments[0]}...{ds_segments[-1]}')
    return ds_segments


def segment_spectra_chunk(sp_mz_int_buf, ds_segments, ds_segments_path):
    for segm_i, (l, r) in ds_segments:
        segm_start, segm_end = np.searchsorted(sp_mz_int_buf[:, 1], (l, r))  # mz expected to be in column 1
        pd.to_msgpack(ds_segments_path / f'{segm_i:04}.msgpack',
                      sp_mz_int_buf[segm_start:segm_end],
                      append=True)


def segment_spectra(imzml_parser, coordinates, ds_segments, ds_segments_path):

    def chunk_list(l, size=5000):
        n = (len(l) - 1) // size + 1
        for i in range(n):
            yield l[size * i:size * (i + 1)]

    logger.info(f'Segmenting dataset into {len(ds_segments)} segments')

    rmtree(ds_segments_path, ignore_errors=True)
    ds_segments_path.mkdir(parents=True)

    ds_segments = list(enumerate(ds_segments))
    sp_id_to_idx = determine_spectra_order(coordinates)

    chunk_size = 5000
    coord_chunk_it = chunk_list(coordinates, chunk_size)

    sp_i = 0
    sp_inds_list, mzs_list, ints_list = [], [], []
    for ch_i, coord_chunk in enumerate(coord_chunk_it):
        logger.debug(f'Segmenting spectra chunk {ch_i}')

        for x, y in coord_chunk:
            mzs_, ints_ = imzml_parser.getspectrum(sp_i)
            mzs_, ints_ = map(np.array, [mzs_, ints_])
            sp_idx = sp_id_to_idx[sp_i]
            sp_inds_list.append(np.ones_like(mzs_) * sp_idx)
            mzs_list.append(mzs_)
            ints_list.append(ints_)
            sp_i += 1

        mzs = np.concatenate(mzs_list)
        by_mz = np.argsort(mzs)
        sp_mz_int_buf = np.array([np.concatenate(sp_inds_list)[by_mz],
                                  mzs[by_mz],
                                  np.concatenate(ints_list)[by_mz]]).T
        segment_spectra_chunk(sp_mz_int_buf, ds_segments, ds_segments_path)

        sp_inds_list, mzs_list, ints_list = [], [], []


def segment_centroids(centr_df, segm_n, centr_segm_path):
    rmtree(centr_segm_path, ignore_errors=True)
    centr_segm_path.mkdir(parents=True)

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n)]
    segm_lower_bounds = list(np.quantile(centr_df.mz, q) for q in segm_bounds_q)

    first_centr_df = centr_df[centr_df.peak_i == 0].copy()
    segment_mapping = np.searchsorted(segm_lower_bounds, first_centr_df.mz.values, side='right') - 1
    first_centr_df['segm_i'] = segment_mapping

    centr_segm_df = pd.merge(centr_df, first_centr_df[['formula_i', 'segm_i']],
                             on='formula_i').sort_values('mz')
    centr_segm_df.groupby('segm_i').apply(
        lambda df: df.to_msgpack(f'{centr_segm_path}/{df.segm_i.iloc[0]:04}.msgpack')
    )
