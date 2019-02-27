import sys
from collections import defaultdict
import pandas as pd
import numpy as np
from scipy.sparse import coo_matrix
import logging

from sm.engine.errors import JobFailedError
from sm.engine.isocalc_wrapper import ISOTOPIC_PEAK_N

MAX_MZ_VALUE = 10**5
MAX_INTENS_VALUE = 10**12
ABS_MZ_TOLERANCE_DA = 0.002

logger = logging.getLogger('engine')


def _check_spectra_quality(spectra_sample):
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


def _estimate_mz_workload(spectra_sample, sf_peak_df, bins=1000):
    mz_arr = np.sort(np.concatenate([sp[1] for sp in spectra_sample]))
    mz_arr = mz_arr[(np.isfinite(mz_arr)) & (np.isnan(mz_arr) == False)]
    mz_range = (mz_arr.min(), mz_arr.max())
    spectrum_mz_freq, mz_grid = np.histogram(mz_arr, bins=bins, range=mz_range)
    sf_peak_mz_freq, _ = np.histogram(sf_peak_df.mz, bins=bins, range=mz_range)
    workload_per_mz = spectrum_mz_freq * sf_peak_mz_freq
    return mz_grid, workload_per_mz, spectrum_mz_freq


def _define_mz_bounds(mz_grid, workload_per_mz, sp_workload_per_mz, n=32):
    segm_wl = workload_per_mz.sum() / n
    segm_sp_wl = sp_workload_per_mz.sum() / n

    mz_bounds = []
    wl_sum = sp_wl_sum = 0
    for mz, wl, sp_wl in zip(mz_grid[1:], workload_per_mz, sp_workload_per_mz):
        wl_sum += wl
        sp_wl_sum += sp_wl
        if wl_sum > segm_wl or sp_wl_sum > segm_sp_wl:
            wl_sum = sp_wl_sum = 0
            mz_bounds.append(mz)
    return mz_bounds


def _create_mz_segments(mz_bounds, ppm):
    mz_buckets = []
    for i, (l, r) in enumerate(zip([0] + mz_bounds, mz_bounds + [sys.float_info.max])):
        l -= l * ppm * 1e-6
        r += r * ppm * 1e-6
        mz_buckets.append((l, r))
    return mz_buckets


def _segment_spectrum(sp, mz_buckets):
    sp_id, mzs, ints = sp
    for s_i, (l, r) in enumerate(mz_buckets):
        smask = (mzs >= l) & (mzs <= r)
        yield s_i, (sp_id, mzs[smask], ints[smask])


def _sp_df_gen(sp_it, sp_indexes):
    for sp_id, mzs, intensities in sp_it:
        for mz, ints in zip(mzs, intensities):
            yield sp_indexes[sp_id], mz, ints


def _gen_iso_images(spectra_it, sp_indexes, centr_df, nrows, ncols, ppm, min_px=1):
    if len(centr_df) > 0:
        # a bit slower than using pure numpy arrays but much shorter
        # may leak memory because of https://github.com/pydata/pandas/issues/2659 or smth else
        sp_df = pd.DataFrame(_sp_df_gen(spectra_it, sp_indexes),
                             columns=['idx', 'mz', 'ints']).sort_values(by='mz')

        # -1, + 1 are needed to extend sf_peak_mz range so that it covers 100% of spectra
        centr_df = centr_df[(centr_df.mz >= sp_df.mz.min() - 1) &
                            (centr_df.mz <= sp_df.mz.max() + 1)]
        lower = centr_df.mz.map(lambda mz: mz - mz * ppm * 1e-6)
        upper = centr_df.mz.map(lambda mz: mz + mz * ppm * 1e-6)
        lower_idx = np.searchsorted(sp_df.mz, lower, 'l')
        upper_idx = np.searchsorted(sp_df.mz, upper, 'r')

        for i, (l, u) in enumerate(zip(lower_idx, upper_idx)):
            if u - l >= min_px:
                data = sp_df.ints[l:u].values
                if data.shape[0] > 0:
                    idx = sp_df.idx[l:u].values
                    row_inds = idx / ncols
                    col_inds = idx % ncols
                    m = coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols))
                    # yield centr_df.index[i], (centr_df.peak_i.iloc[i], m)
                    yield centr_df.index[i], centr_df.peak_i.iloc[i], m


# def _img_pairs_to_list(pairs, shape):
#     """ list of (coord, value) pairs -> list of values """
#     if not pairs:
#         return None
#
#     d = defaultdict(lambda: coo_matrix(shape))
#     for k, m in pairs:
#         _m = d[k]
#         d[k] = _m if _m.nnz >= m.nnz else m
#     distinct_pairs = d.items()
#
#     res = np.ndarray((max(d.keys()) + 1,), dtype=object)
#     for i, m in distinct_pairs:
#         res[i] = m
#     return res.tolist()


def define_mz_segments(spectra, centroids_df, ppm):
    first_spectrum = spectra.take(1)[0]
    spectra_n = spectra.count()
    if first_spectrum[1].shape[0] > 10**5:
        spectra_sample = [first_spectrum]
    else:
        n = min(200, max(1, spectra_n // 10))
        spectra_sample = spectra.takeSample(withReplacement=False, num=n)
    _check_spectra_quality(spectra_sample)

    peaks_per_sp = max(1, int(np.mean([mzs.shape[0] for (sp_id, mzs, ints) in spectra_sample])))
    plan_mz_segm_n = (spectra_n * peaks_per_sp) // 10**6  # 1M peaks per segment
    plan_mz_segm_n = int(np.clip(plan_mz_segm_n, 64, 2048))

    segm_bounds_q = [i * 1 / plan_mz_segm_n for i in range(1, plan_mz_segm_n)]
    segm_bounds = [np.quantile(centroids_df.mz.values, q) for q in segm_bounds_q]

    segments = _create_mz_segments(segm_bounds, ppm=ppm)
    logger.debug(f'Generated {len(segments)} m/z segments: {segments[0]}...{segments[-1]}')
    return segments


def gen_iso_peak_images(sc, ds_reader, formula_centroids_df, segm_spectra, ppm):
    sp_indexes_brcast = sc.broadcast(ds_reader.get_norm_img_pixel_inds())
    formula_centroids_df_brcast = sc.broadcast(formula_centroids_df)  # TODO: replace broadcast variable with rdd and cogroup
    nrows, ncols = ds_reader.get_dims()

    # def generate_images_for_segment(item):
    #     _, sp_segm = item
    #     return _gen_iso_images(sp_segm, sp_indexes_brcast.value, formula_centroids_df_brcast.value,
    #                            nrows, ncols, ppm)
    # iso_peak_images = segm_spectra.flatMap(generate_images_for_segment)
    # return iso_peak_images

    def generate_images_for_segment(item):
        _, spectrum_segm = item
        segm_formula_images = defaultdict(lambda: [None] * ISOTOPIC_PEAK_N)
        formula_image_gen = _gen_iso_images(spectrum_segm,
                                            sp_indexes_brcast.value, formula_centroids_df_brcast.value,
                                            nrows, ncols, ppm)
        for formula_i, peak_i, image in formula_image_gen:
            segm_formula_images[formula_i][peak_i] = image
        return list(segm_formula_images.items())

    formula_images = segm_spectra.flatMap(generate_images_for_segment)
    return formula_images


# def gen_formula_images(iso_peak_images, shape):
#     iso_sf_images = (iso_peak_images
#                      .groupByKey(numPartitions=256)
#                      .mapValues(lambda img_pairs_it: _img_pairs_to_list(list(img_pairs_it), shape)))
#     return iso_sf_images


# TODO: add tests
def compute_formula_images(sc, ds_reader, centroids_df, ppm):
    """ Compute isotopic images for all formulas

    Returns
    -----
        pyspark.rdd.RDD
        RDD of sum formula, list[sparse matrix of intensities]
    """
    spectra_rdd = ds_reader.get_spectra()
    mz_segments = define_mz_segments(spectra_rdd, centroids_df, ppm)
    segm_spectra = (spectra_rdd
                    .flatMap(lambda sp: _segment_spectrum(sp, mz_segments))
                    .groupByKey(numPartitions=len(mz_segments)))

    formula_images = gen_iso_peak_images(sc, ds_reader, centroids_df, segm_spectra, ppm)
    # print(iso_peak_images.count())
    # print(iso_peak_images.top(5))

    # print(iso_peak_images.count())
    # raise Exception('Test')

    # formula_images = gen_formula_images(iso_peak_images, shape=ds_reader.get_dims())
    return formula_images
