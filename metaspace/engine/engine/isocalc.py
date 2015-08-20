import numpy as np
import numpy.linalg
import bisect

from pyMS.pyisocalc import pyisocalc
from pyMS.centroid_detection import gradient
from util import *


def get_iso_peaks(sf):
    res_dict = {
        # "isodist_mzs": [],
        # "isodist_ints": [],
        'centr_mzs': [],
        'centr_ints': [],
        # "grad_inds"	: []
    }
    try:
        isotope_ms = pyisocalc.isodist(sf, plot=False, sigma=0.01, charges=1, resolution=200000.0, do_centroid=True)
        centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
        res_dict['centr_mzs'] = centr_mzs
        res_dict['centr_ints'] = centr_ints
    except Exception as e:
        print sf, e.message

    return res_dict
