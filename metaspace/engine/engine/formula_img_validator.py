"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
from collections import namedtuple

from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match
from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation


def _correct_peak_intens_distribution(iso_imgs_flat):
    first_peak_ints = np.sum(map(np.sum, iso_imgs_flat[0:1]))
    second_peak_ints = np.sum(map(np.sum, iso_imgs_flat[1:2]))
    rest_peak_ints = np.sum(map(np.sum, iso_imgs_flat[2:]))
    if (first_peak_ints < second_peak_ints + rest_peak_ints) or (second_peak_ints < rest_peak_ints):
        return False
    else:
        return True


def inv_chaos(iso_img, img_gen_conf):
    chaos = measure_of_chaos(iso_img.copy(),
                             nlevels=img_gen_conf['nlevels'],
                             interp=img_gen_conf['do_preprocessing'],
                             q_val=img_gen_conf['q'])[0]
    if np.isnan(chaos):
        chaos = 0
    inv_chaos = 1 - chaos
    if np.allclose(inv_chaos, 1.0, atol=1e-6):
        inv_chaos = 0
    return inv_chaos


class ImgMeasures(object):
    def __init__(self, chaos, image_corr, pattern_match):
        self.chaos = chaos
        self.image_corr = image_corr
        self.pattern_match = pattern_match


def get_compute_img_measures(empty_matrix, img_gen_conf):

    def compute(iso_images_sparse, sf_intensity):
        diff = len(sf_intensity) - len(iso_images_sparse)
        iso_imgs = [empty_matrix if img is None else img.toarray()
                    for img in iso_images_sparse + [None] * diff]
        iso_imgs_flat = [img.flat[:] for img in iso_imgs]

        measures = ImgMeasures(0, 0, 0)
        if (len(iso_imgs) > 0) and _correct_peak_intens_distribution(iso_imgs_flat):
            measures.pattern_match = isotope_pattern_match(iso_imgs_flat, sf_intensity)

            if measures.pattern_match:
                measures.image_corr = isotope_image_correlation(iso_imgs_flat, weights=sf_intensity[1:])

                if measures.image_corr:
                    measures.chaos = inv_chaos(iso_imgs[0], img_gen_conf)
        return measures.chaos, measures.image_corr, measures.pattern_match

    return compute


def filter_sf_images(sc, ds_config, ds, formulas, sf_images):
    measures_thr = np.array([ds_config['image_measure_thresholds']['measure_of_chaos'],
                             ds_config['image_measure_thresholds']['image_corr'],
                             ds_config['image_measure_thresholds']['pattern_match']])

    nrows, ncols = ds.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    compute_measures = get_compute_img_measures(empty_matrix, ds_config['image_generation'])
    sf_peak_intens_brcast = sc.broadcast(formulas.get_sf_peak_ints())

    sf_metrics_map = (sf_images
                      .map(lambda (sf_i, imgs): (sf_i, compute_measures(imgs, sf_peak_intens_brcast.value[sf_i])))
                      .filter(lambda (_, metrics): np.all(np.array(metrics) > measures_thr))
                      ).collectAsMap()

    sf_iso_images_map = sf_images.filter(lambda (sf_i, _): sf_i in sf_metrics_map).collectAsMap()
    return sf_iso_images_map, sf_metrics_map
