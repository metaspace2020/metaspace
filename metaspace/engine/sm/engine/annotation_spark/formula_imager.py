import logging
import pickle
from pathlib import Path
from typing import List, Set

import numpy as np
import pandas as pd
from pyspark.files import SparkFiles
from scipy.sparse import coo_matrix

from sm.engine.annotation.formula_validator import (
    make_compute_image_metrics,
    formula_image_metrics,
)
from sm.engine.ds_config import DSConfig
from sm.engine.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('engine')


# pylint: disable=too-many-locals
# this function is compute performance optimized
def gen_iso_images(ds_segm_it, centr_df, nrows, ncols, isocalc):
    for ds_segm_df in ds_segm_it:
        ds_segm_mz_min, _ = isocalc.mass_accuracy_bounds(ds_segm_df.mz.values[0])
        _, ds_segm_mz_max = isocalc.mass_accuracy_bounds(ds_segm_df.mz.values[-1])

        centr_df_slice = centr_df[(centr_df.mz >= ds_segm_mz_min) & (centr_df.mz <= ds_segm_mz_max)]

        centr_mzs = centr_df_slice.mz.values
        centr_f_inds = centr_df_slice.formula_i.values
        centr_p_inds = centr_df_slice.peak_i.values
        centr_ints = centr_df_slice.int.values

        lower, upper = isocalc.mass_accuracy_bounds(centr_mzs)
        lower_inds = np.searchsorted(ds_segm_df.mz.values, lower, 'l')
        upper_inds = np.searchsorted(ds_segm_df.mz.values, upper, 'r')

        # Note: consider going in the opposite direction so that
        # formula_image_metrics can check for the first peak images instead of the last
        for i, (lo_i, up_i) in enumerate(zip(lower_inds, upper_inds)):
            m = None
            if up_i - lo_i > 0:
                data = ds_segm_df.int.values[lo_i:up_i]
                inds = ds_segm_df.sp_idx.values[lo_i:up_i]
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
    sp_chunk_list = []
    try:
        with open(segm_path, 'rb') as f:
            while True:
                sp_chunk_list.append(pickle.load(f))
    except EOFError:
        pass

    return pd.concat(sp_chunk_list) if sp_chunk_list else None


def read_centroids_segment(segm_path):
    with open(segm_path, 'rb') as f:
        return pickle.load(f)


def read_ds_segments(first_segm_i, last_segm_i):
    for ds_segm_i in range(first_segm_i, last_segm_i + 1):
        segm_path = get_file_path(f'ds_segm_{ds_segm_i:04}.pickle')
        ds_segm_df = read_ds_segment(segm_path)
        if ds_segm_df is not None:
            yield ds_segm_df.sort_values(by='mz')


def get_file_path(name):
    return Path(SparkFiles.get(name))


def create_process_segment(
    ds_segments: List,
    coordinates: np.ndarray,
    ds_config: DSConfig,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
):
    sample_area_mask = make_sample_area_mask(coordinates)
    nrows, ncols = get_ds_dims(coordinates)
    compute_metrics = make_compute_image_metrics(
        sample_area_mask, nrows, ncols, ds_config['image_generation']
    )
    isocalc = IsocalcWrapper(ds_config)
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

            ds_segm_it = read_ds_segments(first_ds_segm_i, last_ds_segm_i)
            formula_images_it = gen_iso_images(
                ds_segm_it, centr_df=centr_df, nrows=nrows, ncols=ncols, isocalc=isocalc
            )
            formula_metrics_df, formula_images = formula_image_metrics(
                formula_images_it,
                compute_metrics,
                target_formula_inds=target_formula_inds,
                targeted_database_formula_inds=targeted_database_formula_inds,
                n_peaks=n_peaks,
                min_px=min_px,
            )
            logger.info(f'Segment {segm_i} finished')
        else:
            logger.warning(f'Centroids segment path not found {centr_segm_path}')

        return formula_metrics_df, formula_images

    return process_centr_segment
