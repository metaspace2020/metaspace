__author__ = 'intsco'
"""
.. module:: computing_fast_spark
    :synopsis: Functions for running spark jobs.

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""

import numpy as np
import scipy


def txt_to_spectrum(s):
    """Converts a text string in the format to a spectrum in the form of two arrays:
    array of m/z values and array of partial sums of intensities.

    :param s: string id|mz1 mz2 ... mzN|int1 int2 ... intN
    :returns: triple spectrum_id, mzs, cumulative sum of intensities
    """
    arr = s.strip().split("|")
    intensities = np.fromstring("0 " + arr[2], sep=' ')
    return int(arr[0]), np.fromstring(arr[1], sep=' '), np.cumsum(intensities)


def sample_spectrum(sp, mol_mz_intervals):
    """Run multiple queries on a spectrum.

    :param sp: tuple (spectrum id, m/z values, partial sums of ints_slice)
    :param mol_mz_intervals: two arrays providing lower and upper bounds of the m/z intervals
    :returns: tuple (peak_id, (spectrum_id, intensity))
    """
    lower, upper = mol_mz_intervals
    sp_id, mzs, cum_ints = sp
    intensities = cum_ints[mzs.searchsorted(upper, 'r')] - cum_ints[mzs.searchsorted(lower, 'l')]

    for peak_id, intens in enumerate(intensities):
        if intens > 0.001:
            yield peak_id, (sp_id, intens)


def dict_to_matrix(d, rows, cols, row_wise=True):
    if type(d) != dict:
        d = dict(d)
    array = np.bincount(d.keys(), weights=d.values(), minlength=rows * cols)
    img = np.reshape(array, (rows, cols))
    return scipy.sparse.csr_matrix(img if row_wise else img.T)


def process_data(spectra, mol_mz_intervals, rows, cols):
    """ Run a Spark job producing results for each spectrum-query pair

    :param spectra: spectra converted from text using computing_fast.txt_to_spectrum
    :param mol_mz_intervals: set of queries
    :param rows: dataset rows number
    :param cols: dataset cols number
    """
    query_lens = np.array(map(len, mol_mz_intervals))

    # flatten m/z interval bounds so that they can be fed to np.searchsorted
    mz_bounds = [np.array([s[0] for _q in mol_mz_intervals for s in _q]),
                 np.array([s[1] for _q in mol_mz_intervals for s in _q])]

    qres_dict = (spectra
                 .flatMap(lambda sp: sample_spectrum(sp, mz_bounds))
                 .groupByKey()
                 .mapValues(lambda it: sorted(list(it)))
                 ).collectAsMap()

    peak_n = len(mz_bounds[0])
    qres_all_peaks = (qres_dict[peak_i] if peak_i in qres_dict else [] for peak_i in xrange(peak_n))
    qres_flat_list = np.array([dict_to_matrix(res, rows, cols, row_wise=False) for res in qres_all_peaks])

    # unflatten and return the results
    return np.split(qres_flat_list, np.cumsum(query_lens)[:-1])

    # # # convert to a nested list of img arrays
    # return [map(dict, x) for x in qres_nested_list]
