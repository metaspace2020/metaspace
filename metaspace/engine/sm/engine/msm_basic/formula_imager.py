import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from pyspark.files import SparkFiles
from scipy.sparse import coo_matrix

from sm.engine.msm_basic.formula_validator import make_compute_image_metrics, formula_image_metrics

logger = logging.getLogger('engine')


# pylint: disable=too-many-locals
# this function is compute performance optimized
def gen_iso_images(sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols, ppm=3, min_px=1):
    if sp_inds.size > 0:
        by_sp_mz = np.argsort(sp_mzs)  # sort order by mz ascending
        sp_mzs = sp_mzs[by_sp_mz]
        sp_inds = sp_inds[by_sp_mz]
        sp_ints = sp_ints[by_sp_mz]

        by_centr_mz = np.argsort(centr_df.mz.values)  # sort order by mz ascending
        centr_mzs = centr_df.mz.values[by_centr_mz]
        centr_f_inds = centr_df.formula_i.values[by_centr_mz]
        centr_p_inds = centr_df.peak_i.values[by_centr_mz]
        centr_ints = centr_df.int.values[by_centr_mz]

        lower = centr_mzs - centr_mzs * ppm * 1e-6
        upper = centr_mzs + centr_mzs * ppm * 1e-6
        lower_inds = np.searchsorted(sp_mzs, lower, 'l')
        upper_inds = np.searchsorted(sp_mzs, upper, 'r')

        # Note: consider going in the opposite direction so that
        # formula_image_metrics can check for the first peak images instead of the last
        for i, (lo_i, up_i) in enumerate(zip(lower_inds, upper_inds)):
            m = None
            if up_i - lo_i >= min_px:
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
    if segments:
        return np.concatenate(segments)
    else:
        return np.array([])


def read_ds_segments(first_segm_i, last_segm_i):
    sp_arr = [
        read_ds_segment(get_file_path(f'ds_segm_{segm_i:04}.pickle'))
        for segm_i in range(first_segm_i, last_segm_i + 1)
    ]
    sp_arr = [a for a in sp_arr if a.size > 0]
    if sp_arr:
        sp_arr = np.concatenate(sp_arr)
        sp_arr = sp_arr[sp_arr[:, 1].argsort()]  # assume mz in column 1
    else:
        sp_arr = np.empty((0, 3))
    return sp_arr


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
        centr_segm_path = get_file_path(f'centr_segm_{segm_i:04}.parquet')

        formula_metrics_df, formula_images = pd.DataFrame(), {}
        if centr_segm_path.exists():
            logger.info(f'Reading centroids segment {segm_i} from {centr_segm_path}')

            centr_df = pq.read_table(centr_segm_path).to_pandas()
            first_ds_segm_i, last_ds_segm_i = choose_ds_segments(ds_segments, centr_df, ppm)

            logger.info(f'Reading dataset segments {first_ds_segm_i}-{last_ds_segm_i}')

            sp_arr = read_ds_segments(first_ds_segm_i, last_ds_segm_i)

            formula_images_it = gen_iso_images(
                sp_inds=sp_arr[:, 0],
                sp_mzs=sp_arr[:, 1],
                sp_ints=sp_arr[:, 2],
                centr_df=centr_df,
                nrows=nrows,
                ncols=ncols,
                ppm=ppm,
                min_px=min_px,
            )
            formula_metrics_df, formula_images = formula_image_metrics(
                formula_images_it, compute_metrics, target_formula_inds, n_peaks
            )
            logger.info(f'Segment {segm_i} finished')
        else:
            logger.warning(f'Centroids segment path not found {centr_segm_path}')

        return formula_metrics_df, formula_images

    return process_centr_segment
