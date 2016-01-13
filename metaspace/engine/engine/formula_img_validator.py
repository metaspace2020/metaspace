"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
from operator import mul, add

from engine.pyIMS.image_measures import measure_of_chaos, isotope_image_correlation, isotope_pattern_match

# from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
# from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation
# from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match


# def _correct_peak_intens_distribution(iso_imgs_flat):
#     first_peak_ints = np.sum(map(np.sum, iso_imgs_flat[0:1]))
#     second_peak_ints = np.sum(map(np.sum, iso_imgs_flat[1:2]))
#     rest_peak_ints = np.sum(map(np.sum, iso_imgs_flat[2:]))
#     if (first_peak_ints < second_peak_ints + rest_peak_ints) or (second_peak_ints < rest_peak_ints):
#         return False
#     else:
#         return True


class ImgMeasures(object):
    def __init__(self, chaos, image_corr, pattern_match):
        self.chaos = chaos
        self.image_corr = image_corr
        self.pattern_match = pattern_match

    @staticmethod
    def replace_nan(v, new_v=0):
        if not v or np.isinf(v) or np.isnan(v):
            return new_v
        else:
            return v

    def to_tuple(self, replace_nan=True):
        if replace_nan:
            return (self.replace_nan(self.chaos),
                    self.replace_nan(self.image_corr),
                    self.replace_nan(self.pattern_match))
        else:
            return self.chaos, self.image_corr, self.pattern_match


def get_compute_img_measures(empty_matrix, img_gen_conf):

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


def filter_sf_images(sc, ds_config, ds, formulas, sf_images):
    nrows, ncols = ds.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    compute_measures = get_compute_img_measures(empty_matrix, ds_config['image_generation'])
    sf_peak_intens_brcast = sc.broadcast(formulas.get_sf_peak_ints())

    sf_metrics = (sf_images
                  .map(lambda (sf_i, imgs): (sf_i, compute_measures(imgs, sf_peak_intens_brcast.value[sf_i])))
                  .filter(lambda (_, metrics): reduce(add, metrics) > 0))
    if ds_config["molecules_num"]:
        sf_metrics_map = dict(sf_metrics.takeOrdered(ds_config["molecules_num"],
                                                     lambda (_, metrics): -reduce(mul, metrics)))
    else:
        sf_metrics_map = sf_metrics.collectAsMap()

    sf_iso_images_map = sf_images.filter(lambda (sf_i, _): sf_i in sf_metrics_map).collectAsMap()
    return sf_iso_images_map, sf_metrics_map
