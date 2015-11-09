from pyMS.pyisocalc import pyisocalc
import numpy as np


def slice_array(mzs, lower, upper):
    return np.hstack(map(lambda (l, u): mzs[l:u], zip(lower, upper)))


def get_iso_peaks(sf_id, sf, isocalc_config):
    charges = 0
    polarity = isocalc_config['charge']['polarity']
    if polarity == '+':
        charges = isocalc_config['charge']['n_charges']
    elif polarity == '-':
        charges = -isocalc_config['charge']['n_charges']

    for adduct in isocalc_config['adducts']:
        try:
            res_dict = {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}
            sf_adduct = pyisocalc.complex_to_simple(sf + adduct)
            if sf_adduct:
                isotope_ms = pyisocalc.isodist(sf_adduct,
                                               plot=False,
                                               sigma=isocalc_config['isocalc_sig'],
                                               charges=charges,
                                               resolution=isocalc_config['isocalc_resolution'],
                                               do_centroid=isocalc_config['isocalc_do_centroid'])

                centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
                res_dict['centr_mzs'] = centr_mzs
                res_dict['centr_ints'] = centr_ints

                profile_mzs, profile_ints = isotope_ms.get_spectrum(source='profile')
                lower = profile_mzs.searchsorted(centr_mzs, 'l') - 3
                upper = profile_mzs.searchsorted(centr_mzs, 'r') + 3
                res_dict['profile_mzs'] = slice_array(profile_mzs, lower, upper)
                res_dict['profile_ints'] = slice_array(profile_ints, lower, upper)

        except Exception as e:
            print sf, e.message
        finally:
            yield sf_id, adduct, res_dict


if __name__ == '__main__':
    pass
