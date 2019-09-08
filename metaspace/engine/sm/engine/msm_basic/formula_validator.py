"""
Classes and functions for isotope image validation
"""
from collections import OrderedDict, defaultdict

import numpy as np
import pandas as pd
from pyImagingMSpec.image_measures import isotope_image_correlation, isotope_pattern_match
from cpyImagingMSpec import measure_of_chaos


METRICS = OrderedDict(
    [
        ('chaos', 0),
        ('spatial', 0),
        ('spectral', 0),
        ('msm', 0),
        ('total_iso_ints', [0, 0, 0, 0]),
        ('min_iso_ints', [0, 0, 0, 0]),
        ('max_iso_ints', [0, 0, 0, 0]),
    ]
)


def replace_nan(val, default=0):
    def replace(x):
        if not x or np.isinf(x) or np.isnan(x):
            return default

        return float(x)

    if isinstance(val, list):
        return [replace(x) for x in val]

    return replace(val)


def make_compute_image_metrics(sample_area_mask, nrows, ncols, img_gen_config):
    """ Returns a function for computing formula images metrics

    Args
    -----
    sample_area_mask: ndarray[bool]
        mask for separating sampled pixels (True) from non-sampled (False)

    img_gen_config : dict
        isotope_generation section of the dataset config
    Returns
    -----
        function
    """
    empty_matrix = np.zeros((nrows, ncols))
    sample_area_mask_flat = sample_area_mask.flatten()

    def compute_metrics(iso_images_sparse, formula_ints):
        np.seterr(invalid='ignore')  # to ignore division by zero warnings

        doc = METRICS.copy()
        if iso_images_sparse:
            iso_imgs = [
                img.toarray() if img is not None else empty_matrix for img in iso_images_sparse
            ]

            iso_imgs_flat = [img.flatten()[sample_area_mask_flat] for img in iso_imgs]
            iso_imgs_flat = iso_imgs_flat[: len(formula_ints)]

            doc['spectral'] = isotope_pattern_match(iso_imgs_flat, formula_ints)
            if doc['spectral'] > 0:

                doc['spatial'] = isotope_image_correlation(iso_imgs_flat, weights=formula_ints[1:])
                if doc['spatial'] > 0:

                    moc = measure_of_chaos(iso_imgs[0], img_gen_config.get('n_levels', 30))
                    doc['chaos'] = 0 if np.isclose(moc, 1.0) else moc
                    if doc['chaos'] > 0:

                        doc['msm'] = doc['chaos'] * doc['spatial'] * doc['spectral']
                        doc['total_iso_ints'] = [img.sum() for img in iso_imgs]
                        doc['min_iso_ints'] = [img.min() for img in iso_imgs]
                        doc['max_iso_ints'] = [img.max() for img in iso_imgs]
        return OrderedDict((k, replace_nan(v)) for k, v in doc.items())

    return compute_metrics


def complete_image_list(images):
    non_empty_image_n = sum(1 for img in images if img is not None)
    return non_empty_image_n > 1 and images[0] is not None


def formula_image_metrics(
    formula_images_it, compute_metrics, target_formula_inds, n_peaks
):  # function optimized for compute performance
    """ Compute isotope image metrics for each formula

    Args
    ---
    formula_images_it: Iterator
    compute_metrics: function
    target_formula_inds: set
    n_peaks: int

    Returns
    ---
        pandas.DataFrame
    """

    formula_metrics = {}
    formula_images = {}

    formula_images_buffer = defaultdict(lambda: [None] * n_peaks)
    formula_ints_buffer = defaultdict(lambda: [0] * n_peaks)

    def add_metrics(f_i, f_images, f_ints):
        if complete_image_list(f_images):
            f_metrics = compute_metrics(f_images, f_ints)
            if f_metrics['msm'] > 0:
                formula_metrics[f_i] = f_metrics
                if f_i in target_formula_inds:
                    formula_images[f_i] = f_images

    for f_i, p_i, f_int, image in formula_images_it:
        formula_images_buffer[f_i][p_i] = image
        formula_ints_buffer[f_i][p_i] = f_int

        if p_i == n_peaks - 1:  # last formula image index
            f_images = formula_images_buffer.pop(f_i)
            f_ints = formula_ints_buffer.pop(f_i)
            add_metrics(f_i, f_images, f_ints)

    # process formulas with len(peaks) < max_peaks and those that were cut to dataset max mz
    for f_i, f_images in formula_images_buffer.items():
        f_ints = formula_ints_buffer[f_i]
        add_metrics(f_i, f_images, f_ints)

    formula_metrics_df = pd.DataFrame.from_dict(formula_metrics, orient='index')
    formula_metrics_df.index.name = 'formula_i'
    return formula_metrics_df, formula_images
