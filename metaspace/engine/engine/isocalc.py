import numpy as np
import numpy.linalg
import bisect

from pyMS.pyisocalc import pyisocalc
from pyMS.centroid_detection import gradient

from util import *


def get_lists_of_mzs(sf):
    try:
        isotope_ms = pyisocalc.isodist(sf, plot=False, sigma=0.01, charges=1, resolution=200000.0, do_centroid=True)
        mzs, intens = isotope_ms.get_spectrum()
        mzs_list, intensities_list, indices_list = gradient(mzs, intens, max_output=-1, weighted_bins=0)
        indices_list = [i if intens[i] > intens[i + 1] else i + 1 for i in indices_list]
        mzs_list = [mzs[i] for i in indices_list]
        intensities_list = [intens[i] for i in indices_list]
        min_i = np.min([i for i in xrange(len(intens)) if intens[i] > 0.01])
        max_i = np.max([i for i in xrange(len(intens)) if intens[i] > 0.01])
        return {
            "isodist_mzs": mzs[min_i:max_i],
            "isodist_ints": intens[min_i:max_i],
            "grad_mzs": list(mzs_list),
            "grad_ints": list(intensities_list),
            "grad_inds": list(indices_list - min_i)
        }
    except Exception as e:
        print sf, e
        return {
            "isodist_mzs" : [],
            "isodist_ints" : [],
            "grad_mzs"	  : [],
            "grad_ints"	  : [],
            "grad_inds"	  : []
        }
