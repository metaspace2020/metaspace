"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np

from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match
from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation


def _correct_peak_intens_distribution(self, iso_imgs_flat):
    first_peak_ints = np.sum(map(np.sum, iso_imgs_flat[0:1]))
    second_peak_ints = np.sum(map(np.sum, iso_imgs_flat[1:2]))
    rest_peak_ints = np.sum(map(np.sum, iso_imgs_flat[2:]))
    if (first_peak_ints < second_peak_ints + rest_peak_ints) or (second_peak_ints < rest_peak_ints):
        return False
    else:
        return True


def _compute_img_measures(iso_images_sparse, sf_intensity, empty_matrix, img_gen_conf):
    diff = len(sf_intensity) - len(iso_images_sparse)
    iso_imgs = [empty_matrix if img is None else img.toarray()
                for img in iso_images_sparse + [None] * diff]
    iso_imgs_flat = [img.flat[:] for img in iso_imgs]

    measures = 0, 0, 0
    if (len(iso_imgs) > 0) and _correct_peak_intens_distribution(iso_imgs_flat):
        pattern_match = isotope_pattern_match(iso_imgs_flat, sf_intensity)

        if pattern_match:
            image_corr = isotope_image_correlation(iso_imgs_flat, weights=sf_intensity[1:])

            if image_corr:
                chaos = measure_of_chaos(iso_imgs[0].copy(),
                                         nlevels=img_gen_conf['nlevels'],
                                         interp=img_gen_conf['do_preprocessing'],
                                         q_val=img_gen_conf['q'])[0]
                if np.isnan(chaos):
                    chaos = 0
                inv_chaos = 1 - chaos
                if np.allclose(inv_chaos, 1.0, atol=1e-6):
                    inv_chaos = 0
                measures = (inv_chaos, image_corr, pattern_match)
    return measures


def filter_sf_images(sc, ds_config, ds, formulas, sf_images):
    measures_thr = np.array([ds_config['image_measure_thresholds']['measure_of_chaos'],
                             ds_config['image_measure_thresholds']['image_corr'],
                             ds_config['image_measure_thresholds']['pattern_match']])
    img_gen_conf = ds_config['image_generation']

    nrows, ncols = ds.get_dims()
    empty_matrix = np.zeros((nrows, ncols))
    sf_peak_intens_brcast = sc.broadcast(formulas.get_sf_peak_ints())

    sf_metrics_map = (sf_images
                      .map(lambda (sf_i, imgs):
                           (sf_i, _compute_img_measures(imgs,
                                                        sf_peak_intens_brcast.value[sf_i],
                                                        empty_matrix,
                                                        img_gen_conf)))
                      .filter(lambda (_, metrics): np.all(np.array(metrics) > measures_thr))
                      ).collectAsMap()

    sf_iso_images_map = sf_images.filter(lambda (sf_i, _): sf_i in sf_metrics_map).collectAsMap()
    return sf_iso_images_map, sf_metrics_map
