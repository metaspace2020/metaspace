"""
Classes and functions for isotope image validation
"""
import numpy as np
import pandas as pd
from operator import mul, add
from collections import OrderedDict, defaultdict

from pyImagingMSpec.image_measures import isotope_image_correlation, isotope_pattern_match
# from pyImagingMSpec.image_measures import measure_of_chaos
from cpyImagingMSpec import measure_of_chaos
from pyImagingMSpec import smoothing

from sm.engine.isocalc_wrapper import ISOTOPIC_PEAK_N

METRICS = OrderedDict([('chaos', 0), ('spatial', 0), ('spectral', 0), ('msm', 0),
                       ('total_iso_ints', [0, 0, 0, 0]),
                       ('min_iso_ints', [0, 0, 0, 0]),
                       ('max_iso_ints', [0, 0, 0, 0])])


def make_compute_image_metrics(sample_area_mask, nrows, ncols, img_gen_conf):
    """ Returns a function for computing formula images metrics

    Args
    -----
    sample_area_mask: ndarray[bool]
        mask for separating sampled pixels (True) from non-sampled (False)

    img_gen_conf : dict
        isotope_generation section of the dataset config
    Returns
    -----
        function
    """
    def replace_nan(v, default=0):

        def replace(x):
            if not x or np.isinf(x) or np.isnan(x):
                return default
            else:
                return x

        if type(v) is list:
            return [replace(x) for x in v]
        else:
            return replace(v)

    empty_matrix = np.zeros((nrows, ncols))

    def compute(iso_images_sparse, formula_ints):
        np.seterr(invalid='ignore')  # to ignore division by zero warnings

        m = METRICS.copy()
        if len(iso_images_sparse) > 0:
            iso_imgs = [img.toarray() if img is not None else empty_matrix
                        for img in iso_images_sparse]

            iso_imgs_flat = [img.flatten()[sample_area_mask] for img in iso_imgs]
            iso_imgs_flat = iso_imgs_flat[:len(formula_ints)]

            if img_gen_conf['do_preprocessing']:
                for img in iso_imgs_flat:
                    smoothing.hot_spot_removal(img)

            m['spectral'] = isotope_pattern_match(iso_imgs_flat, formula_ints)
            if m['spectral'] > 0:

                m['spatial'] = isotope_image_correlation(iso_imgs_flat, weights=formula_ints[1:])
                if m['spatial'] > 0:

                    moc = measure_of_chaos(iso_imgs[0], img_gen_conf['nlevels'])
                    m['chaos'] = 0 if np.isclose(moc, 1.0) else moc
                    if m['chaos'] > 0:

                        m['msm'] = m['chaos'] * m['spatial'] * m['spectral']
                        m['total_iso_ints'] = [img.sum() for img in iso_imgs]
                        m['min_iso_ints'] = [img.min() for img in iso_imgs]
                        m['max_iso_ints'] = [img.max() for img in iso_imgs]
        metrics = OrderedDict((k, replace_nan(v)) for k, v in m.items())
        return metrics

    return compute


def complete_image_list(images):
    non_empty_image_n = sum(1 for img in images if img is not None)
    return non_empty_image_n > 1 and images[0] is not None


def formula_image_metrics(formula_images_gen, compute_metrics):
    """ Compute isotope image metrics for each formula

    Args
    -----
    sc : pyspark.SparkContext
    ds_config : dict
    ds_reader: engine.dataset_reader.DatasetReader
    formula_centr_ints: dict
    formula_images : pyspark.rdd.RDD
        RDD of (formula, list[images]) pairs

    Returns
    -----
        pandas.DataFrame
    """

    formula_metrics = {}
    formula_images = {}

    formula_images_buffer = defaultdict(lambda: [None] * ISOTOPIC_PEAK_N)
    formula_ints_buffer = defaultdict(lambda: [0] * ISOTOPIC_PEAK_N)

    def add_metrics(f_i, f_images, f_ints):
        if complete_image_list(f_images):
            f_metrics = compute_metrics(f_images, f_ints)
            if f_metrics['msm'] > 0:
                formula_metrics[f_i] = f_metrics
                # if f_i in target_formula_ids:
                formula_images[f_i] = f_images

    for f_i, p_i, f_int, image in formula_images_gen:
        formula_images_buffer[f_i][p_i] = image
        formula_ints_buffer[f_i][p_i] = f_int

        if p_i == ISOTOPIC_PEAK_N - 1:  # last formula image index
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

    # def spark_compute_metrics(item):
    #     formula_i, images = item
    #     centr_ints = formula_centr_ints_brcast.value[formula_i]
    #     return (formula_i,) + compute_metrics(images, centr_ints)

    # msm_index = list(metrics.keys()).index('msm') + 1  # formula_i takes the first index
    # def filter_metrics(item):
    #     msm = item[msm_index]
    #     return msm > 0

    # formula_metrics = (formula_images
    #                    .map(spark_compute_metrics)
    #                    .collect())

    # index_columns = ['formula_i']
    # columns = index_columns + list(METRICS.keys())
    # formula_metrics_df = pd.DataFrame(formula_metrics, columns=columns).set_index(index_columns)
    # return formula_metrics_df
