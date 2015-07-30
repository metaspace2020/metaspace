import numpy as np
import numpy.linalg
import bisect

from pyMS.pyisocalc import pyisocalc
from pyMS.centroid_detection import gradient

from util import * 
from blockentropy import * 

def get_lists_of_mzs(sf):
	try:
		isotope_ms = pyisocalc.isodist(sf,plot=False,sigma=0.01,charges=-1,resolution=100000.0,do_centroid=False)
		mzlist = list(isotope_ms.get_mzs())
		intenslist = list(isotope_ms.get_intensities())
		mzs_list, intensities_list, indices_list = gradient(isotope_ms.get_mzs(), isotope_ms.get_intensities(), max_output=-1, weighted_bins=0)
		indices_list = [i if intenslist[i] > intenslist[i+1] else i+1 for i in indices_list]
		mzs_list = [mzlist[i] for i in indices_list]
		intensities_list = [intenslist[i] for i in indices_list]
		min_i = np.min([ i for i in xrange(len(intenslist)) if intenslist[i] > 0.01])
		max_i = np.max([ i for i in xrange(len(intenslist)) if intenslist[i] > 0.01])
		return {
			"isodist_mzs" : mzlist[min_i:max_i],
			"isodist_int" : intenslist[min_i:max_i],
			"grad_mzs"	  : list(mzs_list),
			"grad_int"	  : list(intensities_list),
			"grad_ind"	  : list(indices_list - min_i) }
	except:
		return {
			"isodist_mzs" : [],
			"isodist_int" : [],
			"grad_mzs"	  : [],
			"grad_int"	  : [],
			"grad_ind"	  : []
		}



