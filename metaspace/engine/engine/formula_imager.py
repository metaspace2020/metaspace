"""
.. module:: mol_searcher
    :synopsis: Classes for searching molecules in mass spec datasets.

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
import scipy.sparse
from itertools import izip, repeat


def _txt_to_spectrum(s):
    """Converts a text string in the format to a spectrum in the form of two arrays:
    array of m/z values and array of partial sums of intensities.

    :param s: string id|mz1 mz2 ... mzN|int1 int2 ... intN
    :returns: triple spectrum_id, mzs, cumulative sum of intensities
    """
    arr = s.strip().split("|")
    intensities = np.fromstring("0 " + arr[2], sep=' ')
    return int(arr[0]), np.fromstring(arr[1], sep=' '), np.cumsum(intensities)


def _get_nonzero_ints(sp, lower, upper):
    sp_i, mzs, cum_ints = sp
    ints = cum_ints[mzs.searchsorted(upper, 'r')] - cum_ints[mzs.searchsorted(lower, 'l')]
    peak_inds = np.arange(len(lower))
    return sp_i, peak_inds[ints > 0.001], ints[ints > 0.001]


def _sample_spectrum(sp, peak_bounds, sf_peak_map):
    """Run multiple queries on a spectrum.

    :param sp: tuple (spectrum id, m/z values, partial sums of ints_slice)
    :param peak_bounds: two arrays providing lower and upper bounds of the m/z intervals
    :returns: tuple (peak_i, (spectrum_id, intensity))
    """
    lower, upper = peak_bounds
    sp_i, non_zero_int_inds, non_zero_ints = _get_nonzero_ints(sp, lower, upper)
    sf_inds = sf_peak_map[:, 0][non_zero_int_inds]
    peak_inds = sf_peak_map[:, 1][non_zero_int_inds]

    return zip(izip(sf_inds, peak_inds),
               izip(repeat(sp_i), non_zero_ints))


def _coord_list_to_matrix(sp_iter, norm_img_pixel_inds, nrows, ncols):
    sp_intens_arr = np.array(list(sp_iter), dtype=[('sp', int), ('intens', float)])
    img_array = np.zeros(nrows*ncols)
    pixel_inds = norm_img_pixel_inds[sp_intens_arr['sp']]
    img_array[pixel_inds] = sp_intens_arr['intens']
    return scipy.sparse.csr_matrix(img_array.reshape(nrows, ncols))


def _img_pairs_to_list(pairs):
    if not pairs:
        return None
    length = max([i for i, img in pairs]) + 1
    res = np.ndarray((length,), dtype=object)
    for i, img in pairs:
        res[i] = img
    return res.tolist()


def compute_images(sc, ds_config, ds, formulas):
    spectra = ds.get_data().map(_txt_to_spectrum)

    mz_bounds_cand_brcast = sc.broadcast(formulas.get_sf_peak_bounds())
    sf_peak_map_brcast = sc.broadcast(formulas.get_sf_peak_map())
    nrows, ncols = ds.get_dims()
    norm_img_pixel_inds = ds.get_norm_img_pixel_inds()

    sf_images = (spectra
                 .flatMap(lambda sp: _sample_spectrum(sp, mz_bounds_cand_brcast.value, sf_peak_map_brcast.value))
                 .groupByKey()
                 .map(lambda ((sf_i, p_i), spectrum_it):
                      (sf_i, (p_i, _coord_list_to_matrix(spectrum_it, norm_img_pixel_inds, nrows, ncols))))
                 .groupByKey()
                 .mapValues(lambda img_pairs_it: _img_pairs_to_list(list(img_pairs_it))))

    return sf_images
