import logging
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix

from sm.engine.msm_basic.formula_validator import make_compute_image_metrics, formula_image_metrics

logger = logging.getLogger('engine')


def gen_iso_images(sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols, ppm=3, min_px=1):
    if len(sp_inds) > 0:
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


def ds_dims(coordinates):
    min_x, min_y = np.amin(coordinates, axis=0)
    max_x, max_y = np.amax(coordinates, axis=0)
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1
    return nrows, ncols


def determine_spectra_order(coordinates):
    _coord = np.array(coordinates)
    _coord = np.around(_coord, 5)  # correct for numerical precision
    _coord -= np.amin(_coord, axis=0)

    _, ncols = ds_dims(coordinates)
    pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
    pixel_indices = pixel_indices.astype(np.int32)
    return pixel_indices


def make_sample_area_mask(coordinates):
    sp_indices = determine_spectra_order(coordinates)
    nrows, ncols = ds_dims(coordinates)
    sample_area_mask = np.zeros(ncols * nrows, dtype=bool)
    sample_area_mask[sp_indices] = True
    return sample_area_mask.reshape(nrows, ncols)


def create_process_segment(ds_segments_path, centr_segm_path,
                           coordinates, image_gen_conf, target_formula_inds):
    sample_area_mask = make_sample_area_mask(coordinates)
    nrows, ncols = ds_dims(coordinates)
    compute_metrics = make_compute_image_metrics(sample_area_mask, nrows, ncols, image_gen_conf)

    def process_segment(segm_i):
        logger.info(f'Processing segment {segm_i}')
        logger.info(f'Reading spectra data from {ds_segments_path / str(segm_i)}')
        data = pd.read_msgpack(ds_segments_path / f'{segm_i}')
        if type(data) == pd.DataFrame:
            sp_df = data
        else:
            sp_df = pd.concat(data)
        logger.info(f'Reading centroids data from {centr_segm_path / str(segm_i)}')
        centr_df = pd.read_msgpack(centr_segm_path / f'{segm_i}')

        formula_images_gen = gen_iso_images(sp_df.idx.values, sp_df.mz.values, sp_df.int.values,
                                            centr_df, nrows, ncols, ppm=3, min_px=1)
        formula_metrics_df, formula_images = \
            formula_image_metrics(formula_images_gen, compute_metrics, target_formula_inds)
        logger.info(f'Segment {segm_i} finished')
        return formula_metrics_df, formula_images

    return process_segment