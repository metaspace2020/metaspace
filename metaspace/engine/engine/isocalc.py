from pyMS.pyisocalc import pyisocalc
import numpy as np


def get_iso_peaks(sf):
    res_dict = {
        'centr_mzs': [],
        'centr_ints': [],
        'profile_mzs': [],
        'profile_ints': []
    }
    try:
        isotope_ms = pyisocalc.isodist(sf, plot=False, sigma=0.01, charges=1, resolution=200000.0, do_centroid=True)
        centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
        res_dict['centr_mzs'] = centr_mzs
        res_dict['centr_ints'] = centr_ints

        profile_mzs, profile_ints = isotope_ms.get_spectrum(source='profile')
        lower = profile_mzs.searchsorted(centr_mzs, 'l')-3
        upper = profile_mzs.searchsorted(centr_mzs, 'r')+3
        res_dict['profile_mzs'] = np.hstack(map(lambda (l,u): profile_mzs[l:u], zip(lower, upper)))
        res_dict['profile_ints'] = np.hstack(map(lambda (l,u): profile_ints[l:u], zip(lower, upper)))

    except Exception as e:
        print sf, e.message

    return res_dict

if __name__ == '__main__':
    get_iso_peaks('C15H22O9')