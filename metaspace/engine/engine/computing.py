import numpy as np
import bisect

from pyMS.pyisocalc import pyisocalc
from pyMS.centroid_detection import gradient

def txt_to_spectrum(s):
    arr = s.strip().split("|")
    return ( arr[0], np.array([ float(x) for x in arr[2].split(" ") ]), np.array([ float(x) for x in arr[1].split(" ") ]) )

def get_one_group_total_txt(name, mz_lower, mz_upper, mzs, intensities):
    res = get_one_group_total(mz_lower, mz_upper, mzs, intensities)
    if res > 0.0001:
    	return "%s:%.4f" % (name, res)
    else:
    	return ""

def get_many_groups_total_txt(queries, sp):
	return [get_one_group_total_txt(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries]

def reduce_manygroups_txt(x, y):
	return [ join_strings(x[i], y[i]) for i in xrange(len(x))]

def get_many_groups2d_total_txt(data, sp):
	return [ [get_one_group_total_txt(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries] for queries in data]

def reduce_manygroups2d_txt(xarray, yarray):
	return [ [ join_strings(xarray[i][j], yarray[i][j]) for j in xrange(len(xarray[i]))] for i in xrange(len(xarray)) ]

def join_strings(s1, s2):
	if s1 == "":
		return s2
	elif s2 == "":
		return s1
	else:
		return s1 + " " + s2


def join_dicts(s1, s2):
	s1.update({ k : v + s1.get(k, 0.0) for k,v in s2.iteritems() })
	return s1

def get_many_groups_total_dict(queries, sp):
	res = get_one_group_total_dict(sp[0], queries[0][0], queries[0][1], sp[1], sp[2])
	for q in queries[1:]:
		res = join_dicts(res, get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]))
	return res


def reduce_manygroups_dict(x, y):
	return [ join_dicts(x[i], y[i]) for i in xrange(len(x))]

def reduce_manygroups2d_dict_individual(xarray, yarray):
	return [ [ join_dicts(xarray[j][i], yarray[j][i]) for i in xrange(len(xarray[j])) ] for j in xrange(len(xarray)) ]

def get_many_groups2d_total_dict(data, sp):
	# return [ [get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries] for queries in data]
	return [ get_many_groups_total_dict(queries, sp) for queries in data]

def inner_correlations(images):
	# 3. Score correlation with monoiso
	notnull_monoiso = ion_datacube.xic[:,0] > 0 # only compare pixels with values in the monoisotopic (otherwise high correlation for large empty areas)
	print isotope_ms[adduct].get_spectrum(source='centroids')[1][1:]
	iso_correlation_score[adduct] = np.average([np.corrcoef(ion_datacube.xic[notnull_monoiso,0],ion_datacube.xic[notnull_monoiso,ii])[0,1] for ii in range(1,len(mz_list))] ,weights=isotope_ms[adduct].get_spectrum(source='centroids')[1][1:])
	
	# 4. Score isotope ratio
	isotope_intensity = np.asarray(isotope_ms[adduct].get_spectrum(source='centroids')[1])
	image_intensities = [sum(ion_datacube.xic[:,ii]) for ii in range(0,len(mz_list))]
	iso_ratio_score[adduct] = 1-np.mean(abs( isotope_intensity/np.linalg.norm(isotope_intensity) - image_intensities/np.linalg.norm(image_intensities)))

def corr_dicts(a, b):
    commonkeys = [ k for k in a if k in b ]
    return np.corrcoef(np.array([ a[k] for k in commonkeys ]), np.array([ b[k] for k in commonkeys ]))[0][1]

def avg_dict_correlation(images):
	corrs = []
	for i in xrange(len(images)):
		for j in xrange(i):
			commonkeys = [ k for k in images[i] if k in images[j] ]
			if len(commonkeys) > 0:
				corrs.append(np.corrcoef(np.array([ images[i][k] for k in commonkeys ]), np.array([ images[j][k] for k in commonkeys ]))[0][1])
			else:
				corrs.append( 0 )
	res = np.mean(corrs)
	if np.isnan(res):
		return 0
	else:
		return res

def reduce_manygroups2d_dict(xarray, yarray):
	return [ join_dicts(xarray[i], yarray[i]) for i in xrange(len(xarray)) ]

def get_lists_of_mzs(sf):
	try:
		isotope_ms = pyisocalc.isodist(sf,plot=False,sigma=0.01,charges=-2,resolution=100000.0,do_centroid=False)
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



