import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from pyspark.files import SparkFiles
from scipy.sparse import coo_matrix

from sm.engine.msm_basic.formula_validator import make_compute_image_metrics, formula_image_metrics

logger = logging.getLogger('engine')


# pylint: disable=too-many-locals
# this function is compute performance optimized
def gen_iso_images(ds_segm_sp_array_it, centr_df, nrows, ncols, ppm=3):
    for sp_arr in ds_segm_sp_array_it:
        sp_inds = sp_arr[:, 0]
        sp_mzs = sp_arr[:, 1]
        sp_ints = sp_arr[:, 2]

        if sp_inds.size > 0:
            ds_segm_mz_min = sp_mzs[0] - sp_mzs[0] * ppm * 1e-6
            ds_segm_mz_max = sp_mzs[-1] + sp_mzs[-1] * ppm * 1e-6
            centr_df_slice = centr_df[
                (centr_df.mz > ds_segm_mz_min) & (centr_df.mz < ds_segm_mz_max)
            ]

            centr_mzs = centr_df_slice.mz.values
            centr_f_inds = centr_df_slice.formula_i.values
            centr_p_inds = centr_df_slice.peak_i.values
            centr_ints = centr_df_slice.int.values

            lower = centr_mzs - centr_mzs * ppm * 1e-6
            upper = centr_mzs + centr_mzs * ppm * 1e-6
            lower_inds = np.searchsorted(sp_mzs, lower, 'l')
            upper_inds = np.searchsorted(sp_mzs, upper, 'r')

            # Note: consider going in the opposite direction so that
            # formula_image_metrics can check for the first peak images instead of the last
            for i, (lo_i, up_i) in enumerate(zip(lower_inds, upper_inds)):
                m = None
                if up_i - lo_i >= 0:
                    data = sp_ints[lo_i:up_i]
                    inds = sp_inds[lo_i:up_i]
                    row_inds = inds / ncols
                    col_inds = inds % ncols
                    m = coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols), copy=True)
                yield centr_f_inds[i], centr_p_inds[i], centr_ints[i], m


def get_ds_dims(coordinates):
    min_x, min_y = np.amin(coordinates, axis=0)
    max_x, max_y = np.amax(coordinates, axis=0)
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1
    return nrows, ncols


def get_pixel_indices(coordinates):
    _coord = np.array(coordinates)
    _coord = np.around(_coord, 5)  # correct for numerical precision
    _coord -= np.amin(_coord, axis=0)

    _, ncols = get_ds_dims(coordinates)
    pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
    pixel_indices = pixel_indices.astype(np.int32)
    return pixel_indices


def make_sample_area_mask(coordinates):
    pixel_indices = get_pixel_indices(coordinates)
    nrows, ncols = get_ds_dims(coordinates)
    sample_area_mask = np.zeros(ncols * nrows, dtype=bool)
    sample_area_mask[pixel_indices] = True
    return sample_area_mask.reshape(nrows, ncols)


def choose_ds_segments(ds_segments, centr_df, ppm):
    centr_segm_min_mz, centr_segm_max_mz = centr_df.mz.agg([np.min, np.max])
    centr_segm_min_mz -= centr_segm_min_mz * ppm * 1e-6
    centr_segm_max_mz += centr_segm_max_mz * ppm * 1e-6

    first_ds_segm_i = np.searchsorted(ds_segments[:, 0], centr_segm_min_mz, side='right') - 1
    first_ds_segm_i = max(0, first_ds_segm_i)
    last_ds_segm_i = np.searchsorted(
        ds_segments[:, 1], centr_segm_max_mz, side='left'
    )  # last included
    last_ds_segm_i = min(len(ds_segments) - 1, last_ds_segm_i)
    return first_ds_segm_i, last_ds_segm_i


def read_ds_segment(segm_path):
    segments = []
    try:
        with open(segm_path, 'rb') as f:
            while True:
                segments.append(pickle.load(f))
    except EOFError:
        pass
    return np.concatenate(segments) if segments else np.array([])


def read_centroids_segment(segm_path):
    with open(segm_path, 'rb') as f:
        return pickle.load(f)


def read_ds_segments(first_segm_i, last_segm_i):
    for ds_segm_i in range(first_segm_i, last_segm_i + 1):
        segm_path = get_file_path(f'ds_segm_{ds_segm_i:04}.pickle')
        sp_arr = read_ds_segment(segm_path)
        sp_arr = sp_arr[sp_arr[:, 1].argsort()]  # assume mz in column 1
        yield sp_arr


def get_file_path(name):
    return Path(SparkFiles.get(name))


def create_process_segment(ds_segments, coordinates, ds_config, target_formula_inds):
    sample_area_mask = make_sample_area_mask(coordinates)
    nrows, ncols = get_ds_dims(coordinates)
    compute_metrics = make_compute_image_metrics(
        sample_area_mask, nrows, ncols, ds_config['image_generation']
    )
    ppm = ds_config['image_generation']['ppm']
    min_px = ds_config['image_generation']['min_px']
    n_peaks = ds_config['isotope_generation']['n_peaks']

    def process_centr_segment(segm_i):
        centr_segm_path = get_file_path(f'centr_segm_{segm_i:04}.pickle')

        formula_metrics_df, formula_images = pd.DataFrame(), {}
        if centr_segm_path.exists():
            logger.info(f'Reading centroids segment {segm_i} from {centr_segm_path}')

            centr_df = read_centroids_segment(centr_segm_path)
            first_ds_segm_i, last_ds_segm_i = choose_ds_segments(ds_segments, centr_df, ppm)

            logger.info(f'Reading dataset segments {first_ds_segm_i}-{last_ds_segm_i}')

            ds_segm_sp_array_it = read_ds_segments(first_ds_segm_i, last_ds_segm_i)
            formula_images_it = gen_iso_images(
                ds_segm_sp_array_it, centr_df=centr_df, nrows=nrows, ncols=ncols, ppm=ppm
            )
            formula_metrics_df, formula_images = formula_image_metrics(
                formula_images_it, compute_metrics, target_formula_inds, n_peaks, min_px
            )
            logger.info(f'Segment {segm_i} finished')
        else:
            logger.warning(f'Centroids segment path not found {centr_segm_path}')

        return formula_metrics_df, formula_images

    return process_centr_segment
