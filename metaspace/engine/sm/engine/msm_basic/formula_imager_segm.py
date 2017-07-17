import sys
from collections import defaultdict
import pandas as pd
from itertools import repeat, islice
import numpy as np
from scipy.sparse import coo_matrix


def _estimate_mz_workload(spectra_sample, sf_peak_df, bins=1000):
    mz_arr = np.sort(np.concatenate([sp[1] for sp in spectra_sample]))
    spectrum_mz_freq, mz_grid = np.histogram(mz_arr, bins=bins, range=(np.nanmin(mz_arr), np.nanmax(mz_arr)))
    sf_peak_mz_freq, _ = np.histogram(sf_peak_df.mz, bins=bins, range=(mz_arr.min(), mz_arr.max()))
    workload_per_mz = spectrum_mz_freq * sf_peak_mz_freq
    return mz_grid, workload_per_mz, spectrum_mz_freq


def _find_mz_bounds(mz_grid, workload_per_mz, sp_workload_per_mz, n=32):
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


def _gen_iso_images(spectra_it, sp_indexes, sf_peak_df, nrows, ncols, ppm, peaks_per_sp_segm, min_px=1):
    if len(sf_peak_df) > 0:
        # a bit slower than using pure numpy arrays but much shorter
        # may leak memory because of https://github.com/pydata/pandas/issues/2659 or smth else
        sp_df = pd.DataFrame(_sp_df_gen(spectra_it, sp_indexes),
                             columns=['idx', 'mz', 'ints']).sort_values(by='mz')

        # -1, + 1 are needed to extend sf_peak_mz range so that it covers 100% of spectra
        sf_peak_df = sf_peak_df[(sf_peak_df.mz >= sp_df.mz.min()-1) & (sf_peak_df.mz <= sp_df.mz.max()+1)]
        lower = sf_peak_df.mz.map(lambda mz: mz - mz*ppm*1e-6)
        upper = sf_peak_df.mz.map(lambda mz: mz + mz*ppm*1e-6)
        lower_idx = np.searchsorted(sp_df.mz, lower, 'l')
        upper_idx = np.searchsorted(sp_df.mz, upper, 'r')

        for i, (l, u) in enumerate(zip(lower_idx, upper_idx)):
            if u - l >= min_px:
                data = sp_df.ints[l:u].values
                if data.shape[0] > 0:
                    idx = sp_df.idx[l:u].values
                    row_inds = idx / ncols
                    col_inds = idx % ncols
                    yield (sf_peak_df.sf_id.iloc[i], sf_peak_df.adduct.iloc[i]),\
                          (sf_peak_df.peak_i.iloc[i], coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols)))


def _img_pairs_to_list(pairs, shape):
    """ list of (coord, value) pairs -> list of values """
    if not pairs:
        return None

    d = defaultdict(lambda: coo_matrix(shape))
    for k, m in pairs:
        _m = d[k]
        d[k] = _m if _m.nnz >= m.nnz else m
    distinct_pairs = d.items()

    res = np.ndarray((max(d.keys()) + 1,), dtype=object)
    for i, m in distinct_pairs:
        res[i] = m
    return res.tolist()


def find_mz_segments(spectra, sf_peak_df, ppm):
    first_spectrum = spectra.take(1)[0]
    if first_spectrum[1].shape[0] > 10**5:
        spectra_sample = [first_spectrum]
    else:
        n = min(200, spectra.count() // 10)
        spectra_sample = spectra.takeSample(withReplacement=False, num=n)
    peaks_per_sp = max(1, int(np.mean([mzs.shape[0] for (sp_id, mzs, ints) in spectra_sample])))

    mz_grid, workload_per_mz, sp_workload_per_mz = _estimate_mz_workload(spectra_sample, sf_peak_df, bins=10000)
    plan_mz_segm_n = min(2048, max(64, int(peaks_per_sp / 10)))
    mz_bounds = _find_mz_bounds(mz_grid, workload_per_mz, sp_workload_per_mz, n=plan_mz_segm_n)
    mz_segments = _create_mz_segments(mz_bounds, ppm=ppm)
    return spectra_sample, mz_segments, peaks_per_sp


def gen_iso_peak_images(sc, ds, sf_peak_df, segm_spectra, peaks_per_sp_segm, ppm):
    sp_indexes_brcast = sc.broadcast(ds.reader.get_norm_img_pixel_inds())
    sf_peak_df_brcast = sc.broadcast(sf_peak_df)  # TODO: replace broadcast variable with rdd and cogroup
    nrows, ncols = ds.reader.get_dims()

    def generate_images_for_segment(item):
        _, sp_segm = item
        return _gen_iso_images(sp_segm, sp_indexes_brcast.value, sf_peak_df_brcast.value,
                               nrows, ncols, ppm, peaks_per_sp_segm)
    iso_peak_images = segm_spectra.flatMap(generate_images_for_segment)
    return iso_peak_images


def gen_iso_sf_images(iso_peak_images, shape):
    iso_sf_images = (iso_peak_images
                     .groupByKey(numPartitions=256)
                     .mapValues(lambda img_pairs_it: _img_pairs_to_list(list(img_pairs_it), shape)))
    return iso_sf_images


# TODO: add tests
def compute_sf_images(sc, ds, sf_peak_df, ppm):
    """ Compute isotopic images for all formulae

    Returns
    ----------
    : pyspark.rdd.RDD
        RDD of sum formula, list[sparse matrix of intensities]
    """
    spectra_rdd = ds.reader.get_spectra()

    spectra_sample, mz_segments, peaks_per_sp = find_mz_segments(spectra_rdd, sf_peak_df, ppm)
    segm_spectra = (spectra_rdd
                    .flatMap(lambda sp: _segment_spectrum(sp, mz_segments))
                    .groupByKey(numPartitions=len(mz_segments)))

    peaks_per_sp_segm = peaks_per_sp / len(mz_segments)
    iso_peak_images = gen_iso_peak_images(sc, ds, sf_peak_df, segm_spectra, peaks_per_sp_segm, ppm)
    iso_sf_images = gen_iso_sf_images(iso_peak_images, shape=ds.reader.get_dims())

    return iso_sf_images

