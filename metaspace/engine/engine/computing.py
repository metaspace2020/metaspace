"""
.. module:: computing
    :synopsis: Functions for running spark jobs.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

import numpy as np
import numpy.linalg
import bisect

import numpy as np

from engine.util import *
from engine.pyIMS.image_measures.level_sets_measure import *


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
    qres = spectra.map(lambda sp: process_spectrum_multiple_queries(data, sp)).reduce(
        reduce_manygroups2d_dict_individual)
    # entropies = [ [ get_block_entropy_dict(x, nrows, ncols) for x in res ] for res in qres ]
    return qres


def run_extractmzs(sc, fname, data, nrows, ncols):
    '''Run the processing job on a single sum formula.'''
    ff = sc.textFile(fname)
    spectra = ff.map(txt_to_spectrum)
    qres = spectra.map(lambda sp: get_many_groups_total_dict_individual(data, sp)).reduce(reduce_manygroups_dict)
    # entropies = dict( (k, [ get_block_entropy_dict(x, nrows, ncols) for x in v ]) for k,v in qres.iteritems())
    return qres


def process_spectrum_multiple_queries(mol_mz_intervals, sp):
    '''Run multiple queries on a spectrum.

	:param mol_mz_intervals: list of sets of queries (each set corresponds to several peaks)
	:param sp: spectrum given as a dictionary
	'''
    return [process_spectrum_onequery(mz_intervals, sp) for mz_intervals in mol_mz_intervals]


def process_spectrum_onequery(mz_intervals, sp):
    '''Run one set of queries on a spectrum.'''
    return [get_sp_peak_int(sp[0], mz_int[0], mz_int[1], sp[1], sp[2]) for mz_int in mz_intervals]


def get_sp_peak_int(name, mz_lower, mz_upper, mzs, intensities):
    '''Get a single query datapoint as a dictionary.

	:param name: key for the resulting dictionary
	:param mz_lower: lower bound on the m/z interval
	:param mz_upper: upper bound on the m/z interval
	:param mzs: list of m/z values in the spectrum
	:param intensities: list of intensities in the spectrum

	Returns:
		the total intensity of the input spectrum summed over the [mz_lower, mz_upper] interval; returns an empty dictionary if intensity is too low
	'''
    res = np.sum(intensities[bisect.bisect_left(mzs, mz_lower): bisect.bisect_right(mzs, mz_upper)])
    if res > 0.0001:
        return {int(name): res}
    else:
        return {}


def get_many_groups_total_dict_individual(queries, sp):
    '''Run one set of queries on a spectrum and return result as a dictionary.'''
    res = dict(
        (k, [get_sp_peak_int(sp[0], q[0], q[1], sp[1], sp[2]) for q in v]) for k, v in queries.iteritems())
    return res


def txt_to_spectrum(s):
    '''Converts a text string in the format
	:samp:`id|mz1 mz2 ... mzN|int1 int2 ... intN`
	to a spectrum in the form of two arrays: array of m/z values and array of intensities.'''
    arr = s.strip().split("|")
    return (arr[0], np.array([float(x) for x in arr[1].split(" ")]), np.array([float(x) for x in arr[2].split(" ")]))


def reduce_manygroups2d_dict(xarray, yarray):
    '''The basic reduce procedure: sum over two sets of dictionaries.'''
    return [join_dicts(xarray[i], yarray[i]) for i in xrange(len(xarray))]


def join_dicts(s1, s2):
    '''Join two dictionaries, combining and adding their values.'''
    s1.update(dict((k, v + s1.get(k, 0.0)) for k, v in s2.iteritems()))
    return s1


def reduce_manygroups_dict(x, y):
    return dict((k, [join_dicts(v[i], y[k][i]) for i in xrange(len(v))]) for k, v in x.iteritems())


def reduce_manygroups2d_dict_individual(xarray, yarray):
    '''The basic depth-two reduce procedure: sum over two sets of lists of dictionaries.'''
    return [[join_dicts(xarray[j][i], yarray[j][i]) for i in xrange(len(xarray[j]))] for j in xrange(len(xarray))]


def iso_pattern_match(images, theor_iso_ints):
    '''Match between theor isotope intensities and images intensities'''
    if len(images) != len(theor_iso_ints):
        return 0
    image_intensities = np.array([np.sum(img.values()) for img in images])
    ints_match = 1 - np.mean(abs(theor_iso_ints/np.linalg.norm(theor_iso_ints) - image_intensities/np.linalg.norm(image_intensities)))
    if np.isnan(ints_match):
        return 0
    else:
        return ints_match


def iso_img_correlation(images, theor_iso_ints=[]):
    '''Average correlation between the first monoisotopic image and all other images'''
    img_arrays = []
    for i, img in enumerate(images):
        maxInd = max(img.keys())
        img_arrays.append(np.array([img.get(ind, 0) for ind in range(maxInd+1)]))

    if len(theor_iso_ints):
        iso_correlation = np.average(np.corrcoef(img_arrays)[1:,0], weights=theor_iso_ints[1:])
    else:
        iso_correlation = np.average(np.corrcoef(img_arrays)[1:,0])

    if np.isnan(iso_correlation):
        return 0
    else:
        return iso_correlation


if __name__ == '__main__':
    pass







