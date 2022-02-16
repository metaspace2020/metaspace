import logging
import pickle
from pathlib import Path
from typing import List, Set, Iterator

import numpy as np
import pandas as pd
from pyspark.files import SparkFiles
from scipy.sparse import coo_matrix

from sm.engine.annotation.formula_validator import (
    make_compute_image_metrics,
    formula_image_metrics,
    FormulaImageItem,
)
from sm.engine.annotation.imzml_reader import ImzMLReader
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.ds_config import DSConfig

logger = logging.getLogger('engine')


# pylint: disable=too-many-locals
# this function is compute performance optimized
def gen_iso_images(ds_segm_it, centr_df, nrows, ncols, isocalc) -> Iterator[FormulaImageItem]:
    for ds_segm_df in ds_segm_it:
        ds_segm_mz_min, _ = isocalc.mass_accuracy_bounds(ds_segm_df.mz.values[0])
        _, ds_segm_mz_max = isocalc.mass_accuracy_bounds(ds_segm_df.mz.values[-1])

        centr_df_slice = centr_df[(centr_df.mz >= ds_segm_mz_min) & (centr_df.mz <= ds_segm_mz_max)]

        centr_mzs = centr_df_slice.mz.values
        centr_ints = centr_df_slice.int.values
        centr_f_inds = centr_df_slice.formula_i.values
        centr_p_inds = centr_df_slice.peak_i.values

        lower, upper = isocalc.mass_accuracy_bounds(centr_mzs)
        lower_inds = np.searchsorted(ds_segm_df.mz.values, lower, 'l')
        upper_inds = np.searchsorted(ds_segm_df.mz.values, upper, 'r')

        # Note: consider going in the opposite direction so that
        # formula_image_metrics can check for the first peak images instead of the last
        for i, (lo_i, up_i) in enumerate(zip(lower_inds, upper_inds)):
            image = mz_image = None
            if up_i - lo_i > 0:
                # Copy ints/mzs so that these slices don't pin the whole dataset segment in memory
                ints = ds_segm_df.int.values[lo_i:up_i].astype('f', copy=True)
                mzs = ds_segm_df.mz.values[lo_i:up_i].astype('f', copy=True)
                inds = ds_segm_df.sp_idx.values[lo_i:up_i]
                row_inds, col_inds = np.divmod(inds, ncols, dtype='i')
                # The row_inds/col_inds can be safely shared between the two coo_matrixes
                image = coo_matrix((ints, (row_inds, col_inds)), shape=(nrows, ncols), copy=False)
                mz_image = coo_matrix((mzs, (row_inds, col_inds)), shape=(nrows, ncols), copy=False)

            yield FormulaImageItem(
                formula_i=centr_f_inds[i],
                peak_i=centr_p_inds[i],
                theo_mz=centr_mzs[i],
                theo_int=centr_ints[i],
                # If this image includes the last element of the dataset segment, it's possible the
                # next dataset segment will include more pixels from this image.
                may_be_split=up_i >= len(ds_segm_df) - 1,
                image=image,
                mz_image=mz_image,
            )


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
            # Mergesort is used for 2 reasons:
            # * It's much faster than the default quicksort, because m/z data is already partially
            #   sorted and the underlying "Timsort" implementation is optimized for partially-sorted
            #   data.
            # * It's a "stable sort", meaning it will preserve the ordering by spectrum index if mz
            #   values are equal. The order of pixels affects some metrics, so this stability is
            #   important.
            yield ds_segm_df.sort_values(by='mz', kind='mergesort')


def get_file_path(name):
    return Path(SparkFiles.get(name))


def create_process_segment(
    ds_segments: List,
    imzml_reader: ImzMLReader,
    ds_config: DSConfig,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
):
    compute_metrics = make_compute_image_metrics(imzml_reader, ds_config)
    isocalc = IsocalcWrapper(ds_config)
    ppm = ds_config['image_generation']['ppm']
    min_px = ds_config['image_generation']['min_px']
    n_peaks = ds_config['isotope_generation']['n_peaks']
    compute_unused_metrics = ds_config['image_generation'].get('compute_unused_metrics')
    nrows, ncols = imzml_reader.h, imzml_reader.w

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
                compute_unused_metrics=compute_unused_metrics,
            )
            logger.info(f'Segment {segm_i} finished')
        else:
            logger.warning(f'Centroids segment path not found {centr_segm_path}')

        return formula_metrics_df, formula_images

    return process_centr_segment
