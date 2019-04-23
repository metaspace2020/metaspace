import logging
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


def spectra_sample_gen(imzml_parser, sp_n, sample_ratio=0.05, max_sample_size=1000):
    sample_size = min(max_sample_size, int(sp_n * sample_ratio))
    sample_sp_inds = np.random.choice(np.arange(sp_n), sample_size)
    for sp_idx in sample_sp_inds:
        mzs, ints = imzml_parser.getspectrum(sp_idx)
        yield sp_idx, mzs, ints


def define_mz_segments(imzml_parser, centroids_df, sample_ratio=0.05, mz_overlap=8, ppm=3):

    def optimal_segm_n(total_n_mz, mz_per_segm, min_i, max_i):
        n = round(total_n_mz / mz_per_segm)
        i = np.argmin([abs(n - 2 ** i) for i in range(min_i, max_i)])
        return 2 ** (min_i + i)

    def bounds_to_segments(segm_bounds):
        mz_segments = []
        for i, (l, r) in enumerate(zip(segm_bounds[:-1],
                                       segm_bounds[1:])):
            l -= mz_overlap / 2 + l * ppm * 1e-6
            r += mz_overlap / 2 + r * ppm * 1e-6
            mz_segments.append((l, r))
        return mz_segments

    sp_n = len(imzml_parser.coordinates)
    spectra_sample = list(spectra_sample_gen(imzml_parser, sp_n, sample_ratio))
    check_spectra_quality(spectra_sample)
    min_mzs, max_mzs, n_mzs = zip(*((mzs[0], mzs[-1], len(mzs))
                                    for (sp_id, mzs, ints) in spectra_sample))
    min_mz, max_mz, n_mz = min(min_mzs), max(max_mzs), sum(n_mzs)

    total_n_mz = n_mz * 1 / sample_ratio
    segm_n = optimal_segm_n(total_n_mz, mz_per_segm=5e5, min_i=4, max_i=8)

    centr_mzs = centroids_df[(centroids_df.mz > min_mz) & (centroids_df.mz < max_mz)].mz.values

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_bounds = [np.quantile(centr_mzs, q) for q in segm_bounds_q]

    segments = bounds_to_segments(segm_bounds)
    logger.info(f'Generated {len(segments)} m/z segments: {segments[0]}...{segments[-1]}')
    return np.array(segments)


def segment_spectra(imzml_parser, coordinates, mz_segments, ds_segments_path):

    def chunk_list(l, size=5000):
        n = (len(l) - 1) // size + 1
        for i in range(n):
            yield l[size * i:size * (i + 1)]

    def segment_spectra_chunk(sp_inds, mzs, ints):
        for segm_i, (l, r) in enumerate(mz_segments):
            mask = (mzs > l) & (mzs < r)
            n = mask.sum()
            a = np.zeros((n, 3))
            a[:, 0] = sp_inds[mask]
            a[:, 1] = mzs[mask]
            a[:, 2] = ints[mask]
            (pd.DataFrame(a, columns=['idx', 'mz', 'int'])
             .to_msgpack(ds_segments_path / f'{segm_i}', append=True))

    logger.info(f'Segmenting spectra into {len(mz_segments)} segments')

    rmtree(ds_segments_path, ignore_errors=True)
    ds_segments_path.mkdir(parents=True)

    sp_indices = determine_spectra_order(coordinates)

    chunk_size = 5000
    coord_chunk_it = chunk_list(coordinates, chunk_size)

    sp_i = 0
    sp_inds, mzs, ints = [], [], []
    for ch_i, coord_chunk in enumerate(coord_chunk_it):
        logger.debug(f'Segmenting chunk {ch_i}')

        for x, y in coord_chunk:
            mzs_, ints_ = map(np.array, imzml_parser.getspectrum(sp_i))
            sp_idx = sp_indices[sp_i]
            sp_inds.append(np.ones_like(mzs_) * sp_idx)
            mzs.append(mzs_)
            ints.append(ints_)
            sp_i += 1

        segment_spectra_chunk(np.concatenate(sp_inds),
                              np.concatenate(mzs),
                              np.concatenate(ints))
        sp_inds, mzs, ints = [], [], []


def segment_centroids(centr_df, mz_segments, centr_segm_path):
    logger.info(f'Segmenting centroids into {len(mz_segments)} segments')

    formula_segments = {}
    for segm_i in range(len(mz_segments))[::-1]:
        logger.debug(f'Segment {segm_i}')

        segm_min_mz, segm_max_mz = mz_segments[segm_i]

        segm_df = centr_df[(~centr_df.formula_i.isin(formula_segments))
                           & (centr_df.mz > segm_min_mz)
                           & (centr_df.mz < segm_max_mz)]

        by_fi = segm_df.groupby('formula_i').peak_i
        formula_min_peak = by_fi.min()
        formula_max_peak = by_fi.max()

        formula_inds = set(formula_min_peak[formula_min_peak == 0].index)
        formula_inds &= set(formula_max_peak[formula_max_peak > 0].index)

        for f_i in formula_inds:
            formula_segments[f_i] = segm_i

    rmtree(centr_segm_path, ignore_errors=True)
    centr_segm_path.mkdir(parents=True)

    logger.info(f'Saving segments to {centr_segm_path}')
    centr_segm_df = centr_df.join(pd.Series(formula_segments, name='segm'), on='formula_i', how='inner')
    for segm_i, df in centr_segm_df.groupby('segm'):
        df.to_msgpack(f'{centr_segm_path}/{segm_i}')