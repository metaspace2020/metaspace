from pyMS.pyisocalc import pyisocalc


def get_iso_peaks(sf):
    res_dict = {
        'centr_mzs': [],
        'centr_ints': [],
        # 'profile_mzs': [],
        # 'profile_ints': []
    }
    try:
        isotope_ms = pyisocalc.isodist(sf, plot=False, sigma=0.01, charges=1, resolution=200000.0, do_centroid=True)
        centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
        res_dict['centr_mzs'] = centr_mzs
        res_dict['centr_ints'] = centr_ints
        # profile_mzs, profile_ints = isotope_ms.get_spectrum(source='profile')
        # res_dict['profile_mzs'] = profile_mzs
        # res_dict['profile_ints'] = profile_ints
    except Exception as e:
        print sf, e.message

    return res_dict
