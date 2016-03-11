"""
Classes and functions for isotope image validation
"""
import numpy as np
import pandas as pd
from operator import mul, add

from pyIMS.image_measures import measure_of_chaos, isotope_image_correlation, isotope_pattern_match


class ImgMeasures(object):
    """ Container for isotope image metrics

    Args
    ----------
    chaos : float
        measure of chaos, pyIMS.image_measures.measure_of_chaos
    image_corr : float
        isotope image correlation, pyIMS.image_measures.isotope_image_correlation
    pattern_match : float
        theoretical pattern match, pyIMS.image_measures.isotope_pattern_match
    """

    def __init__(self, chaos, image_corr, pattern_match):
        self.chaos = chaos
        self.image_corr = image_corr
        self.pattern_match = pattern_match

    @staticmethod
    def _replace_nan(v, new_v=0):
        if not v or np.isinf(v) or np.isnan(v):
            return new_v
        else:
            return v

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
            return (self._replace_nan(self.chaos),
                    self._replace_nan(self.image_corr),
                    self._replace_nan(self.pattern_match))
        else:
            return self.chaos, self.image_corr, self.pattern_match


def get_compute_img_measures(empty_matrix, img_gen_conf):
    """ Returns a function for computing isotope image metrics

    Args
    ------------
    empty_matrix : ndarray
        empty matrix of the same shape as isotope images
    img_gen_conf : dict
        isotope_generation section of the dataset config
    Returns
    ------------
    : function
        function that returns tuples of metrics for every list of isotope images
    """
    def compute(iso_images_sparse, sf_intensity):
        diff = len(sf_intensity) - len(iso_images_sparse)
        iso_imgs = [empty_matrix if img is None else img.toarray()
                    for img in iso_images_sparse + [None] * diff]
        iso_imgs_flat = [img.flat[:] for img in iso_imgs]

        measures = ImgMeasures(0, 0, 0)
        if len(iso_imgs) > 0:
            measures.pattern_match = isotope_pattern_match(iso_imgs_flat, sf_intensity)
            measures.image_corr = isotope_image_correlation(iso_imgs_flat, weights=sf_intensity[1:])
            measures.chaos = measure_of_chaos(iso_imgs[0], img_gen_conf['nlevels'], overwrite=False)
        return measures.to_tuple()

    return compute


def calculate_msm(sf_metrics_df):
    return (sf_metrics_df.chaos + sf_metrics_df.spatial + sf_metrics_df.spectral) / 3


def filter_sf_images(sf_images, sc, fdr, formulas, ds, ds_config):
    """ Compute isotope image metrics for each formula. If specified in the dataset config returns only images and metrics
    for topN formulas with the highest metrics product.

    Args
    ------------
    sc : pyspark.SparkContext
    ds_config : dict
        dataset configuration
    ds : engine.dataset.Dataset
    formulas : engine.formulas.Formulas
    sf_images : pyspark.rdd.RDD
        RDD of (formula, list[images]) pairs
    Returns
    ------------
    : tuple
        dict(formula -> list[image]), dict(formula -> tuple[metric])
    """
    nrows, ncols = ds.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    compute_measures = get_compute_img_measures(empty_matrix, ds_config['image_generation'])
    sf_peak_intens_brcast = sc.broadcast(formulas.get_sf_peak_ints())

    sf_metrics = (sf_images
                  .map(lambda (sf_i, imgs): (sf_i,) + compute_measures(imgs, sf_peak_intens_brcast.value[sf_i]))
                  ).collect()
    sf_metrics_df = pd.DataFrame(sf_metrics, columns=['index', 'chaos', 'spatial', 'spectral']).set_index('index')

    # TODO: replace add with mul
    msm_ser = calculate_msm(sf_metrics_df)
    msm_ser.name = 'msm'

    sf_msm_df = pd.DataFrame(formulas.get_sf_adduct_peaksn(),
                             columns=['sf_id', 'adduct', 'peakn']).drop('peakn', axis=1)
    sf_msm_df = sf_msm_df.join(msm_ser).fillna(0)

    sf_adduct_msm_fdr = fdr.estimate_fdr(sf_msm_df)
    sf_metrics_df = sf_adduct_msm_fdr.join(sf_metrics_df)

    # TODO: copying all images to the driver is really slow
    sf_iso_images_map = sf_images.filter(lambda (sf_i, _): sf_i in sf_metrics_df.index).collectAsMap()
    return sf_metrics_df, sf_iso_images_map
