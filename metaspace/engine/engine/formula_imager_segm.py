import sys
import numpy as np
from scipy.sparse import coo_matrix


def estimate_mz_workload(spectra_rdd, sf_peak_df):
    # spectra_sample_rdd = spectra_rdd.sample(withReplacement=False, fraction=0.01)
    # spectra_sample = spectra_sample_rdd.collect()
    spectra_sample = spectra_rdd.take(100)
    mz_arr = np.sort(np.concatenate(map(lambda sp: sp[1], spectra_sample)))
    spectrum_mz_freq, mz_grid = np.histogram(mz_arr, bins=1000, range=(mz_arr.min(), mz_arr.max()))
    sf_peak_mz_freq, _ = np.histogram(sf_peak_df.mz, bins=1000, range=(mz_arr.min(), mz_arr.max()))
    workload_per_mz = spectrum_mz_freq * sf_peak_mz_freq
    return mz_grid, workload_per_mz


def find_mz_bounds(mz_grid, workload_per_mz, n=32):
    segm_wl = workload_per_mz.sum() / n

    mz_bounds = []
    wl_sum = 0
    for mz, wl in zip(mz_grid[1:], workload_per_mz):
        wl_sum += wl
        if wl_sum > segm_wl:
            wl_sum = 0
            mz_bounds.append(mz)
    return mz_bounds


def create_mz_buckets(mz_bounds, ppm):
    mz_buckets = []
    for i, (l, r) in enumerate(zip([0] + mz_bounds, mz_bounds + [sys.float_info.max])):
        l -= l * ppm * 1e-6
        r += r * ppm * 1e-6
        mz_buckets.append((l, r))
    return mz_buckets


def segment_sf_peaks(mz_buckets, sf_peak_df):
    return [(s_i, sf_peak_df[(sf_peak_df.mz >= l) & (sf_peak_df.mz <= r)])
    # return [(s_i, sf_peak_df)
            for s_i, (l, r) in enumerate(mz_buckets)]


def segment_spectra(sp, mz_buckets):
    sp_id, mzs, ints = sp
    for s_i, (l, r) in enumerate(mz_buckets):
        smask = (mzs >= l) & (mzs <= r)
        yield s_i, (sp_id, mzs[smask], ints[smask])


def gen_iso_images(spectra_it, sp_indexes, sf_peak_df, nrows, ncols, ppm, min_px=4):
    if len(sf_peak_df) > 0:
        idx_list = []
        mz_list = []
        int_list = []
        for sp_id, mzs, ints in spectra_it:
            sp_idx = len(mzs) * [sp_indexes[sp_id]]
            idx_list.extend(sp_idx)
            mz_list.extend(mzs)
            int_list.extend(ints)

        # TODO: replace with pd.DataFrame
        idx_list = np.asarray(idx_list)
        mz_list = np.asarray(mz_list)
        int_list = np.asarray(int_list)

        mz_order = np.argsort(mz_list)
        idx_list = idx_list[mz_order]
        mz_list = mz_list[mz_order]
        int_list = int_list[mz_order]

        sf_peak_segm_df = sf_peak_df[(sf_peak_df.mz >= mz_list.min()) & (sf_peak_df.mz <= mz_list.max())]
        lower = sf_peak_segm_df.mz.map(lambda mz: mz - mz*ppm*1e-6)
        upper = sf_peak_segm_df.mz.map(lambda mz: mz + mz*ppm*1e-6)

        lower_idx = np.searchsorted(mz_list, lower, 'l')
        upper_idx = np.searchsorted(mz_list, upper, 'r')

        for i, (l, u) in enumerate(zip(lower_idx, upper_idx)):
            if u - l >= min_px:
                data = int_list[l:u]
                if data.shape[0] > 0:
                    idx = idx_list[l:u]
                    row_inds = idx / ncols
                    col_inds = idx % ncols
                    yield (sf_peak_segm_df.sf_id.iloc[i], sf_peak_segm_df.adduct.iloc[i]),\
                          (sf_peak_segm_df.peak_i.iloc[i], coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols)))


def _img_pairs_to_list(pairs):
    """ list of (coord, value) pairs -> list of values """
    if not pairs:
        return None
    length = max([i for i, img in pairs]) + 1
    res = np.ndarray((length,), dtype=object)
    for i, img in pairs:
        res[i] = img
    return res.tolist()


def compute_sf_images(sc, ds, sf_peak_df, ppm):
    """ Compute isotopic images for all formula

    Returns
    ----------
    : pyspark.rdd.RDD
        RDD of sum formula, list[sparse matrix of intensities]
    """
    nrows, ncols = ds.get_dims()
    spectra_rdd = ds.get_spectra()
    # spectra_rdd.cache()

    mz_grid, workload_per_mz = estimate_mz_workload(spectra_rdd, sf_peak_df)

    n = 64
    mz_bounds = find_mz_bounds(mz_grid, workload_per_mz, n)
    mz_buckets = create_mz_buckets(mz_bounds, ppm=ppm)
    segm_spectra = (spectra_rdd
                    .flatMap(lambda sp: segment_spectra(sp, mz_buckets))
                    .groupByKey(numPartitions=n))

    sp_indexes_brcast = sc.broadcast(ds.norm_img_pixel_inds)
    sf_peak_df_brcast = sc.broadcast(sf_peak_df)  # TODO: replace broadcast variable with rdd and cogroup
    iso_peak_images = (segm_spectra
                       .flatMap(lambda (s_i, sp_segm):
                            gen_iso_images(sp_segm, sp_indexes_brcast.value, sf_peak_df_brcast.value,
                                           nrows, ncols, ppm=ppm, min_px=1))
                       )

    iso_sf_images = (iso_peak_images
                     .groupByKey()
                     .mapValues(lambda img_pairs_it: _img_pairs_to_list(list(img_pairs_it))))
    return iso_sf_images