"""
.. module:: computing
    :synopsis: Functions for running spark jobs.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""


import numpy as np
import numpy.linalg
import bisect

from util import *
# from chaos import *


def run_fulldataset(sc, fname, data, nrows, ncols):
	'''Run a full dataset processing job.
	:param sc: SparkContext
	:param fname: dataset filename (either local or on s3n)
	:param data: list of input queries to be sliced out of the dataset
	:param nrows: number of rows in an image
	:param ncols: number of columns in an image
	'''
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	qres = spectra.map(lambda sp : process_spectrum_multiple_queries(data, sp)).reduce(reduce_manygroups2d_dict_individual)
	# entropies = [ [ get_block_entropy_dict(x, nrows, ncols) for x in res ] for res in qres ]
	return qres

def run_extractmzs(sc, fname, data, nrows, ncols):
	'''Run the processing job on a single sum formula.'''
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	qres = spectra.map(lambda sp : get_many_groups_total_dict_individual(data, sp)).reduce(reduce_manygroups_dict)
	# entropies = dict( (k, [ get_block_entropy_dict(x, nrows, ncols) for x in v ]) for k,v in qres.iteritems())
	return qres

def process_spectrum_multiple_queries(data, sp):
	'''Run multiple queries on a spectrum.

	:param data: list of sets of queries (each set corresponds to several peaks)
	:param sp: spectrum given as a dictionary
	'''
	return [ process_spectrum_onequery(queries, sp) for queries in data]

def process_spectrum_onequery(queries, sp):
	'''Run one set of queries on a spectrum.'''
	return [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries ]

def get_one_group_total_dict(name, mz_lower, mz_upper, mzs, intensities):
	'''Get a single query datapoint as a dictionary.

	:param name: key for the resulting dictionary
	:param mz_lower: lower bound on the m/z interval
	:param mz_upper: upper bound on the m/z interval
	:param mzs: list of m/z values in the spectrum
	:param intensities: list of intensities in the spectrum

	Returns:
		the total intensity of the input spectrum summed over the [mz_lower, mz_upper] interval; returns an empty dictionary if intensity is too low
	'''
	res = np.sum(intensities[ bisect.bisect_left(mzs, mz_lower) : bisect.bisect_right(mzs, mz_upper) ])
	if res > 0.0001:
		return {int(name) : res}
	else:
		return {}

def get_many_groups_total_dict_individual(queries, sp):
	'''Run one set of queries on a spectrum and return result as a dictionary.'''
	res = dict( (k, [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in v ]) for k,v in queries.iteritems())
	return res

def txt_to_spectrum(s):
	'''Converts a text string in the format
	:samp:`id|mz1 mz2 ... mzN|int1 int2 ... intN`
	to a spectrum in the form of two arrays: array of m/z values and array of intensities.'''
	arr = s.strip().split("|")
	return ( arr[0], np.array([ float(x) for x in arr[2].split(" ") ]), np.array([ float(x) for x in arr[1].split(" ") ]) )

def reduce_manygroups2d_dict(xarray, yarray):
	'''The basic reduce procedure: sum over two sets of dictionaries.'''
	return [ join_dicts(xarray[i], yarray[i]) for i in xrange(len(xarray)) ]

def join_dicts(s1, s2):
	'''Join two dictionaries, combining and adding their values.'''
	s1.update(dict( (k, v + s1.get(k, 0.0) ) for k,v in s2.iteritems() ) )
	return s1

def reduce_manygroups_dict(x, y):
	return dict( (k, [ join_dicts(v[i], y[k][i]) for i in xrange(len(v))] ) for k,v in x.iteritems() )

def reduce_manygroups2d_dict_individual(xarray, yarray):
	'''The basic depth-two reduce procedure: sum over two sets of lists of dictionaries.'''
	return [ [ join_dicts(xarray[j][i], yarray[j][i]) for i in xrange(len(xarray[j])) ] for j in xrange(len(xarray)) ]

def avg_intensity_correlation(images, peak_intensities):
	'''Correlation between peak intensities and images intensities'''
	if len(images) != len(peak_intensities):
		# print "Length mismatch"
		# print "%s" % peak_intensities
		# print "%s" % images
		return 0
	image_intensities =np.array([ np.sum(img.values()) for img in images ])
	res = 1-np.linalg.norm(abs( peak_intensities/np.linalg.norm(peak_intensities) - image_intensities/np.linalg.norm(image_intensities)))
	if np.isnan(res):
		return 0
	else:
		return res

def avg_dict_correlation(images):
	'''Average correlation between the first, monoisotopic image and all other images'''
	corrs = []
	for i in xrange(1, len(images)):
		commonkeys = [ k for k in images[i] if k in images[0] ]
		if len(commonkeys) > 0:
			corrs.append(np.corrcoef(np.array([ images[i][k] for k in commonkeys ]), np.array([ images[0][k] for k in commonkeys ]))[0][1])
		else:
			corrs.append( 0 )
	res = np.mean(corrs)
	if np.isnan(res):
		return 0
	else:
		return res


