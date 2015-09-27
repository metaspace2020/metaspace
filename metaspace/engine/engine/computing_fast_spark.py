__author__ = 'intsco'
"""
.. module:: computing_fast_spark
    :synopsis: Functions for running spark jobs.

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""

import numpy as np
import scipy.sparse


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
    non_zero_intens = filter(lambda ((sf_i, p_i), intens): intens > 0.001, izip(sf_peak_map, intensities))
    return non_zero_intens

    # for (sf_i, p_i), intens in izip(sf_peak_map, intensities):
    #     yield (sf_i, (p_i, sp_i, intens))


def flat_coord_list_to_matrix(coords, rows, cols, row_wise=True):
    if not coords:
        return None
    inds = map(lambda t: t[0], coords)
    vals = map(lambda t: t[1], coords)
    array = np.bincount(inds, weights=vals, minlength=rows * cols)
    img = np.reshape(array, (rows, cols))
    return scipy.sparse.csr_matrix(img if row_wise else img.T)


def img_pairs_to_list(pairs):
    if not pairs:
        return None
    pair_dict = dict(pairs)
    max_i = max(pair_dict.keys())+1
    return [pair_dict[i] if i in pair_dict else None for i in xrange(max_i)]


def process_data(sc, spectra, sf_mz_intervals, rows, cols, minPartitions):
    """ Run a Spark job producing results for each spectrum-query pair

    :param spectra: spectra converted from text using computing_fast.txt_to_spectrum
    :param sf_mz_intervals: set of queries
    :param rows: dataset rows number
    :param cols: dataset cols number
    """
    # query_lens = np.array(map(len, mol_mz_intervals))
    sf_peak_map = list(enumerate([(i, j) for i, sf_peaks in enumerate(sf_mz_intervals) for j, p in enumerate(sf_peaks)]))
    sf_peak_map_rdd = sc.parallelize(sf_peak_map, numSlices=minPartitions)

    # flatten m/z interval bounds so that they can be fed to np.searchsorted
    mz_bounds = [np.array([s[0] for _q in sf_mz_intervals for s in _q]),
                 np.array([s[1] for _q in sf_mz_intervals for s in _q])]

    # mz_bounds = [np.array([q[0][0] if len(q)>0 else 0 for q in sf_mz_intervals]),
    #              np.array([q[0][1] if len(q)>0 else 0 for q in sf_mz_intervals])]

    # spectra = spectra.collect()
    # x = map(lambda sp: _sample_spectrum(sp, mz_bounds, sf_peak_map), spectra)
    # print len(x), x[:10]

    mz_bounds_brcast = sc.broadcast(mz_bounds)
    qres = (spectra
            .flatMap(lambda sp: sample_spectrum(sp, mz_bounds_brcast.value, sf_peak_map_brcast.value))
            # .filter(lambda (sf_i, (p_i, sp_i, intens)): intens > 0.001)
            .groupByKey()
            .keys().map(lambda (sf_i, p_i): sf_i).distinct()
            # .mapValues(lambda sf_res_it: _combine_sf_results(sf_res_it, rows, cols))
            # # .filter(lambda (sf_i, iso_images): all(img.nnz > 0.001*rows*cols for (peak_i, img) in iso_images))
            # .mapValues(lambda iso_img_pairs: _img_pairs_to_list(iso_img_pairs))
             )
    x = qres.collect()
    print len(x), x[:10]
    # return qres

    # peak_n = len(mz_bounds[0])
    # qres_all_peaks = (qres_dict[peak_i] if peak_i in qres_dict else [] for peak_i in xrange(peak_n))
    # qres_flat_list = np.array([dict_to_matrix(res, rows, cols, row_wise=False) for res in qres_all_peaks])

    # unflatten and return the results
    # return list(enumerate(np.split(qres_flat_list, np.cumsum(query_lens)[:-1])))

