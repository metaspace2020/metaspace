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


def _bounds_to_segments(mz_bounds, ppm):
    mz_buckets = []
    for i, (l, r) in enumerate(zip([0] + mz_bounds,
                                   mz_bounds + [sys.float_info.max])):
        l -= l * ppm * 1e-6
        r += r * ppm * 1e-6
        mz_buckets.append((l, r))
    return mz_buckets


def _define_mz_segments(spectra, centroids_df, ppm=3):
    first_spectrum = spectra.take(1)[0]
    spectra_n = spectra.count()
    if first_spectrum[1].shape[0] > 10**5:
        spectra_sample = [first_spectrum]
    else:
        n = min(200, max(1, spectra_n // 10))
        spectra_sample = spectra.takeSample(withReplacement=False, num=n)
    _check_spectra_quality(spectra_sample)

    peaks_per_sp = max(1, int(np.mean([mzs.shape[0] for (sp_id, mzs, ints) in spectra_sample])))
    segm_n = (spectra_n * peaks_per_sp) // 10**6  # 1M peaks per segment
    segm_n = int(np.clip(segm_n, 64, 2048))

    segm_bounds_q = [i * 1 / segm_n for i in range(1, segm_n)]
    segm_bounds = [np.quantile(centroids_df.mz.values, q) for q in segm_bounds_q]

    segments = _bounds_to_segments(segm_bounds, ppm)
    logger.info(f'Generated {len(segments)} m/z segments: {segments[0]}...{segments[-1]}')
    return segments


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
                    yield centr_df.index[i], centr_df.peak_i.iloc[i], m


def _gen_formula_images(sc, ds_reader, formula_centroids_df, segm_spectra, ppm):
    sp_indexes_brcast = sc.broadcast(ds_reader.get_norm_img_pixel_inds())
    formula_centroids_df_brcast = sc.broadcast(formula_centroids_df)
    nrows, ncols = ds_reader.get_dims()

    def gen_images_for_segment(item):
        _, spectrum_segm = item
        formula_image_gen = _gen_iso_images(spectrum_segm,
                                            sp_indexes_brcast.value, formula_centroids_df_brcast.value,
                                            nrows, ncols, ppm)
        for formula_i, peak_i, image in formula_image_gen:
            f_images = [None] * ISOTOPIC_PEAK_N
            f_images[peak_i] = image
            yield formula_i, f_images

    def merge_image_lists(im_list_a, im_list_b):
        for pi, image_b in enumerate(im_list_b):
            if image_b is not None:
                im_list_a[pi] = image_b
        return im_list_a

    formula_images = (segm_spectra
                      .flatMap(gen_images_for_segment)
                      .reduceByKey(merge_image_lists))
    return formula_images


def compute_formula_images(sc, ds_reader, centroids_df, ppm):
    """ Compute isotopic images for all m/z in centroids_df

    Returns
    -----
        pyspark.rdd.RDD
        RDD of sum formula, List[sparse matrix of intensities]
    """
    spectra_rdd = ds_reader.get_spectra()
    mz_segments = _define_mz_segments(spectra_rdd, centroids_df, ppm)
    segm_spectra = (spectra_rdd
                    .flatMap(lambda sp: _segment_spectrum(sp, mz_segments))
                    .groupByKey(numPartitions=len(mz_segments)))
    return _gen_formula_images(sc, ds_reader, centroids_df, segm_spectra, ppm)
