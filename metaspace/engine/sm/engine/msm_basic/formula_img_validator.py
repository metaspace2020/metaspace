"""
Classes and functions for isotope image validation
"""
import numpy as np
import pandas as pd
from operator import mul, add

from pyImagingMSpec.image_measures import isotope_image_correlation, isotope_pattern_match
# from pyImagingMSpec.image_measures import measure_of_chaos
from cpyImagingMSpec import measure_of_chaos
from pyImagingMSpec import smoothing


class ImgMeasures(object):
    """ Container for isotope image metrics

    Args
    ----------
    chaos : float
        measure of chaos, pyImagingMSpec.image_measures.measure_of_chaos
    image_corr : float
        isotope image correlation, pyImagingMSpec.image_measures.isotope_image_correlation
    pattern_match : float
        theoretical pattern match, pyImagingMSpec.image_measures.isotope_pattern_match
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


def get_compute_img_metrics(sample_area_mask, empty_matrix, img_gen_conf):
    """ Returns a function for computing isotope image metrics

    Args
    ------------
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
        diff = len(sf_ints) - len(iso_images_sparse)
        iso_imgs = [empty_matrix if img is None else img.toarray()
                    for img in iso_images_sparse + [None] * diff]
        iso_imgs_flat = [img.flat[:][sample_area_mask] for img in iso_imgs]

        if img_gen_conf['do_preprocessing']:
            for img in iso_imgs_flat:
                smoothing.hot_spot_removal(img)

        measures = ImgMeasures(0, 0, 0)
        if len(iso_imgs) > 0:
            measures.pattern_match = isotope_pattern_match(iso_imgs_flat, sf_ints)
            measures.image_corr = isotope_image_correlation(iso_imgs_flat, weights=sf_ints[1:])
            moc = measure_of_chaos(iso_imgs[0], img_gen_conf['nlevels'])
            measures.chaos = 0 if np.isclose(moc, 1.0) else moc
        return measures.to_tuple()

    return compute


def _calculate_msm(sf_metrics_df):
    return sf_metrics_df.chaos * sf_metrics_df.spatial * sf_metrics_df.spectral


def sf_image_metrics(sf_images, ds, mol_db, sc):
    """ Compute isotope image metrics for each formula

    Args
    ------------
    sc : pyspark.SparkContext
    ds : engine.dataset.Dataset
    mol_db : engine.formulas.Formulas
    sf_images : pyspark.rdd.RDD
        RDD of (formula, list[images]) pairs
    Returns
    ------------
    : pandas.DataFrame
    """
    nrows, ncols = ds.reader.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    compute_metrics = get_compute_img_metrics(ds.reader.get_sample_area_mask(), empty_matrix,
                                              ds.config['image_generation'])
    sf_add_ints_map_brcast = sc.broadcast(mol_db.get_sf_peak_ints())

    sf_metrics = (sf_images
                  .map(lambda ((sf, adduct), imgs):
                      (sf, adduct) + compute_metrics(imgs, sf_add_ints_map_brcast.value[(sf, adduct)]))
                  ).collect()
    sf_metrics_df = (pd.DataFrame(sf_metrics, columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral'])
                     .set_index(['sf_id', 'adduct']))
    sf_metrics_df['msm'] = _calculate_msm(sf_metrics_df)
    return sf_metrics_df


def sf_image_metrics_est_fdr(sf_metrics_df, mol_db, fdr):
    sf_msm_df = mol_db.get_ion_sorted_df()
    sf_msm_df = sf_msm_df.join(sf_metrics_df.msm).fillna(0)

    sf_adduct_fdr = fdr.estimate_fdr(sf_msm_df)
    return sf_metrics_df.join(sf_adduct_fdr, how='inner')[['chaos', 'spatial', 'spectral', 'msm', 'fdr']]


# def filter_sf_metrics(sf_metrics_df):
#     return sf_metrics_df[(sf_metrics_df.chaos > 0) | (sf_metrics_df.spatial > 0) | (sf_metrics_df.spectral > 0)]
#     # return sf_metrics_df[sf_metrics_df.msm > 0]
#
#
# def filter_sf_images(sf_images, sf_metrics_df):
#     return sf_images.filter(lambda (sf_i, _): sf_i in sf_metrics_df.index)

