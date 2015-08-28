"""
.. module:: computing_fast
    :synopsis: Functions for running spark jobs.

.. moduleauthor:: Artem Tarasov <lomereiter@gmail.com>
"""

import numpy as np

def txt_to_spectrum(s):
    '''Converts a text string in the format
	:samp:`id|int1 int2 ... intN|mz1 mz2 ... mzN`
	to a spectrum in the form of two arrays: array of m/z values and array of partial sums of intensities.'''
    arr = s.strip().split("|")
    intensities = np.fromstring("0 " + arr[1], sep=' ')
    return (int(arr[0]), np.fromstring(arr[2], sep=' '), np.cumsum(intensities))

def process_spectrum_multiple_queries(mol_mz_intervals, sp):
    '''Run multiple queries on a spectrum.

	:param mol_mz_intervals: two arrays providing lower and upper bounds of the m/z intervals
	:param sp: tuple (spectrum id, m/z values, partial sums of intensities)

        Returns:
                tuple (spectrum id, total intensities for each interval)
    '''
    lower, upper = mol_mz_intervals
    mzs, cumsum_int = sp[1], sp[2]
    intensities = cumsum_int[mzs.searchsorted(upper, 'r')] - cumsum_int[mzs.searchsorted(lower, 'l')]
    return (sp[0], intensities)

# the following two functions correspond to the arguments of RDD.aggregate
def reduce_manygroups2d_dict_individual_seq(xarray, y):
    ''' Merges results from a spectrum into xarray '''
    id, results = y
    indices = np.where(results > 0.0001)[0]
    for idx in indices:
        xarray[idx][id] += results[idx] # use defaultdict
    return xarray

def reduce_manygroups2d_dict_individual_comb(xarray, yarray):
    ''' Combines arrays of dictionaries from RDD partitions '''
    for i in xrange(len(xarray)):
        for k, v in yarray[i].iteritems():
            xarray[i][k] += v

    return xarray

from collections import defaultdict

def process_data(spectra, mol_mz_intervals):
    ''' Run a Spark job producing results for each spectrum-query pair
         :param spectra: spectra converted from text using computing_fast.txt_to_spectrum
         :param mol_mz_intervals: set of queries
    '''
    query_lens = np.array(map(len, mol_mz_intervals))

    initial_qres = np.array([defaultdict(float) for _ in xrange(query_lens.sum())])

    # flatten m/z interval bounds so that they can be fed to np.searchsorted
    bounds = [np.array([s[0] for _q in mol_mz_intervals for s in _q]),
              np.array([s[1] for _q in mol_mz_intervals for s in _q])]

    qres = spectra.map(lambda sp: process_spectrum_multiple_queries(bounds, sp))\
                  .aggregate(initial_qres,
                             reduce_manygroups2d_dict_individual_seq,
                             reduce_manygroups2d_dict_individual_comb)

    # unflatten the results
    qres = np.split(qres, np.cumsum(query_lens)[:-1])

    # convert to a nested list of dictionaries 
    return [map(dict, x) for x in qres]
