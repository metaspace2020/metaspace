"""
Classes and functions for isotope image validation
"""
import numpy as np
import pandas as pd
from operator import mul, add
from collections import OrderedDict

from pyImagingMSpec.image_measures import isotope_image_correlation, isotope_pattern_match
# from pyImagingMSpec.image_measures import measure_of_chaos
from cpyImagingMSpec import measure_of_chaos
from pyImagingMSpec import smoothing


class ImgMetrics(object):
    """ Container for isotope image metrics

    Args
    ----------
    metrics: OrderedDict
    """

    def __init__(self, metrics):
        self.map = metrics

    @staticmethod
    def _replace_nan(v, new_v=0):

        def replace(x):
            if not x or np.isinf(x) or np.isnan(x):
                return new_v
            else:
                return x

        if type(v) is list:
            return [replace(x) for x in v]
        else:
            return replace(v)

    def to_tuple(self, replace_nan=True):
        """ Convert metrics to a tuple

        Args
        ------------
        replace_nan : bool
            replace invalid metric values with the default one
        Returns
        ------------
        : tuple
            tuple of metrics
        """
        if replace_nan:
            return tuple(self._replace_nan(v) for v in self.map.values())
        else:
            return tuple(self.map.values())


def get_compute_img_metrics(metrics, sample_area_mask, empty_matrix, img_gen_conf):
    """ Returns a function for computing isotope image metrics

    Args
    ------------
    metrics: OrderedDict
    sample_area_mask: ndarray[bool]
        mask for separating sampled pixels (True) from non-sampled (False)
    empty_matrix : ndarray
        empty matrix of the same shape as isotope images
    img_gen_conf : dict
        isotope_generation section of the dataset config
    Returns
    ------------
    : function
        function that returns tuples of metrics for every list of isotope images
    """
    def compute(iso_images_sparse, sf_ints):
        np.seterr(invalid='ignore')  # to ignore division by zero warnings

        diff = len(sf_ints) - len(iso_images_sparse)
        iso_imgs = [empty_matrix if img is None else img.toarray()
                    for img in iso_images_sparse + [None] * diff]
        iso_imgs_flat = [img.flat[:][sample_area_mask] for img in iso_imgs]

        if img_gen_conf['do_preprocessing']:
            for img in iso_imgs_flat:
                smoothing.hot_spot_removal(img)

        m = ImgMetrics(metrics)
        if len(iso_imgs) > 0:
            m.map['spectral'] = isotope_pattern_match(iso_imgs_flat, sf_ints)
            m.map['spatial'] = isotope_image_correlation(iso_imgs_flat, weights=sf_ints[1:])
            moc = measure_of_chaos(iso_imgs[0], img_gen_conf['nlevels'])
            m.map['chaos'] = 0 if np.isclose(moc, 1.0) else moc

            m.map['total_iso_ints'] = [img.sum() for img in iso_imgs]
            m.map['min_iso_ints'] = [img.min() for img in iso_imgs]
            m.map['max_iso_ints'] = [img.max() for img in iso_imgs]
        return m.to_tuple()

    return compute


def _calculate_msm(sf_metrics_df):
    return sf_metrics_df.chaos * sf_metrics_df.spatial * sf_metrics_df.spectral


def sf_image_metrics(sf_images, metrics, ds, ds_reader, ion_centr_ints, sc):
    """ Compute isotope image metrics for each formula

    Args
    ------------
    metrics: OrderedDict
    sc : pyspark.SparkContext
    ds : engine.dataset.Dataset
    ion_centr_ints: dict
    sf_images : pyspark.rdd.RDD
        RDD of (formula, list[images]) pairs
    Returns
    ------------
    : pandas.DataFrame
    """
    nrows, ncols = ds_reader.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    compute_metrics = get_compute_img_metrics(metrics, ds_reader.get_sample_area_mask(),
                                              empty_matrix, ds.config['image_generation'])
    sf_add_ints_map_brcast = sc.broadcast(ion_centr_ints)

    def calculate_ion_metrics(item):
        ion, images = item
        return (ion,) + compute_metrics(images, sf_add_ints_map_brcast.value[ion])

    sf_metrics = sf_images.map(calculate_ion_metrics).collect()
    index_columns = ['ion_i']
    columns = index_columns + list(metrics.keys())
    sf_metrics_df = pd.DataFrame(sf_metrics, columns=columns).set_index(index_columns)
    sf_metrics_df['msm'] = _calculate_msm(sf_metrics_df)
    return sf_metrics_df
