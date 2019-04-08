import sys
from collections import defaultdict
import pandas as pd
import numpy as np
from scipy.sparse import coo_matrix
import logging

from sm.engine.errors import JobFailedError
from sm.engine.isocalc_wrapper import ISOTOPIC_PEAK_N
from sm.engine.msm_basic.formula_img_validator import formula_image_metrics, make_compute_image_metrics

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


# def _estimate_mz_workload(spectra_sample, sf_peak_df, bins=1000):
#     mz_arr = np.sort(np.concatenate([sp[1] for sp in spectra_sample]))
#     mz_arr = mz_arr[(np.isfinite(mz_arr)) & (np.isnan(mz_arr) == False)]
#     mz_range = (mz_arr.min(), mz_arr.max())
#     spectrum_mz_freq, mz_grid = np.histogram(mz_arr, bins=bins, range=mz_range)
#     sf_peak_mz_freq, _ = np.histogram(sf_peak_df.mz, bins=bins, range=mz_range)
#     workload_per_mz = spectrum_mz_freq * sf_peak_mz_freq
#     return mz_grid, workload_per_mz, spectrum_mz_freq


# def _define_mz_bounds(mz_grid, workload_per_mz, sp_workload_per_mz, n=32):
#     segm_wl = workload_per_mz.sum() / n
#     segm_sp_wl = sp_workload_per_mz.sum() / n
#
#     mz_bounds = []
#     wl_sum = sp_wl_sum = 0
#     for mz, wl, sp_wl in zip(mz_grid[1:], workload_per_mz, sp_workload_per_mz):
#         wl_sum += wl
#         sp_wl_sum += sp_wl
#         if wl_sum > segm_wl or sp_wl_sum > segm_sp_wl:
#             wl_sum = sp_wl_sum = 0
#             mz_bounds.append(mz)
#     return mz_bounds


# def _bounds_to_segments(segm_bounds, mz_overlap, ppm):
#     mz_segments = []
#     for i, (l, r) in enumerate(zip(segm_bounds[:-1],
#                                    segm_bounds[1:])):
#         l -= mz_overlap / 2 + l * ppm * 1e-6
#         r += mz_overlap / 2 + r * ppm * 1e-6
#         mz_segments.append((l, r))
#     return mz_segments


# def _define_mz_segments(spectra, centroids_df, mz_overlap=8, ppm=3):
#     first_spectrum = spectra.take(1)[0]
#     spectra_n = spectra.count()
#     if first_spectrum[1].shape[0] > 10**5:
#         spectra_sample = [first_spectrum]
#     else:
#         n = min(200, max(1, spectra_n // 10))
#         spectra_sample = spectra.takeSample(withReplacement=False, num=n)
#     _check_spectra_quality(spectra_sample)
#
#     peaks_per_sp = max(1, int(np.mean([mzs.shape[0] for (sp_id, mzs, ints) in spectra_sample])))
#     # segm_n = (spectra_n * peaks_per_sp) // 10**6  # 1M peaks per segment
#     # segm_n = int(np.clip(segm_n, 64, 2048))
#     segm_n = 128
#
#     min_mzs, max_mzs = zip(*((mzs[0], mzs[-1]) for (sp_id, mzs, ints) in spectra_sample))
#     min_mz, max_mz = min(min_mzs), max(max_mzs)
#     centr_mzs = centroids_df[(centroids_df.mz > min_mz) & (centroids_df.mz < max_mz)].mz.values
#
#     segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
#     segm_bounds = [np.quantile(centr_mzs, q) for q in segm_bounds_q]
#
#     segments = _bounds_to_segments(segm_bounds, mz_overlap, ppm)
#     logger.info(f'Generated {len(segments)} m/z segments: {segments[0]}...{segments[-1]}')
#     return segments


def gen_iso_images(sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols, ppm=3, min_px=1):
    if len(sp_inds) > 0:
        by_sp_mz = np.argsort(sp_mzs)  # sort order by mz ascending
        sp_mzs = sp_mzs[by_sp_mz]
        sp_inds = sp_inds[by_sp_mz]
        sp_ints = sp_ints[by_sp_mz]

        # # -1, + 1 are needed to extend centr_df.mz range so that it covers 100% of spectra
        # centr_df = centr_df[(centr_df.mz >= sp_mzs.min() - 1) &
        #                     (centr_df.mz <= sp_mzs.max() + 1)]

        by_centr_mz = np.argsort(centr_df.mz.values)  # sort order by mz ascending
        centr_mzs = centr_df.mz.values[by_centr_mz]
        centr_f_inds = centr_df.formula_i.values[by_centr_mz]
        centr_p_inds = centr_df.peak_i.values[by_centr_mz]
        centr_ints = centr_df.int.values[by_centr_mz]

        lower = centr_mzs - centr_mzs * ppm * 1e-6
        upper = centr_mzs + centr_mzs * ppm * 1e-6
        lower_idx = np.searchsorted(sp_mzs, lower, 'l')
        upper_idx = np.searchsorted(sp_mzs, upper, 'r')

        # Note: consider going in the opposite direction so that
        # formula_image_metrics can check for the first peak images instead of the last
        for i, (l, u) in enumerate(zip(lower_idx, upper_idx)):
            m = None
            if u - l >= min_px:
                data = sp_ints[l:u]
                if data.shape[0] > 0:
                    inds = sp_inds[l:u]
                    row_inds = inds / ncols
                    col_inds = inds % ncols
                    m = coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols), copy=True)
            yield centr_f_inds[i], centr_p_inds[i], centr_ints[i], m


def segment_spectrum(item, sp_indices, mz_segments, segm_path):
    sp_id, mzs, intensities = item
    sp_idx = sp_indices[sp_id]

    for segm_i, (l, r) in enumerate(mz_segments):
        segm_mask = (mzs >= l) & (mzs <= r)
        n = sum(segm_mask)
        data = np.zeros((n, 3))
        data[:, 0] = [sp_idx] * n
        data[:, 1] = mzs[segm_mask]
        data[:, 2] = intensities[segm_mask]

        df = pd.DataFrame(data)
        df.to_msgpack()

        # df = pd.DataFrame([[sp_idx] * n, mzs[segm_mask], intensities[segm_mask]],
        #                   columns=['idx', 'mz', 'int'])
        # p = segm_path / f'{segm_i}.msgpack'
        # .to_msgpack(p, append=True)

        # for mz, ints in zip(mzs[segm_mask], intensities[segm_mask]):
        #     yield segm_i, sp_idx, mz, ints


def search_images_compute_metrics(sc, ds_reader, ds_config, centroids_df, ppm):
    """ Compute isotopic images for all m/z in centroids_df

    Returns
    -----
        pyspark.rdd.RDD
        RDD of sum formula, List[sparse matrix of intensities]
    """
    spectra_rdd = ds_reader.get_spectra()
    mz_segments = _define_mz_segments(spectra_rdd, centroids_df, ppm)

    spectra_segments_rdd = (spectra_rdd
                            .flatMap(lambda sp: segment_spectrum(sp))
                            .groupByKey(numPartitions=len(mz_segments)))

    sp_indices_brcast = sc.broadcast(ds_reader.get_norm_img_pixel_inds())
    centroids_df_brcast = sc.broadcast(centroids_df)
    nrows, ncols = ds_reader.get_dims()

    empty_matrix = np.zeros((nrows, ncols))
    compute_metrics = make_compute_image_metrics(ds_reader.get_sample_area_mask(),
                                                 empty_matrix, ds_config['image_generation'])

    def process_segment(spectra_it):
        formula_images_gen = gen_iso_images(spectra_it, sp_indices_brcast.value,
                                            centroids_df_brcast.value, nrows, ncols, ppm)
        formula_metrics_df, formula_images = \
            formula_image_metrics(formula_images_gen, compute_metrics)
        return formula_metrics_df, formula_images

    images_metrics_rdd = spectra_segments_rdd.mapValues(process_segment)
    return images_metrics_rdd
