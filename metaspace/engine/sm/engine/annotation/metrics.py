import numpy as np
from cpyImagingMSpec import measure_of_chaos
from pyImagingMSpec.image_measures import isotope_pattern_match, isotope_image_correlation
from scipy.ndimage import maximum_filter, minimum_filter, grey_closing


def spectral_metric(iso_imgs_flat, formula_ints):
    # Ignore div-by-zero / NaN errors - they're handled internally
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.nan_to_num(isotope_pattern_match(iso_imgs_flat, formula_ints))


def spatial_metric(iso_imgs_flat, n_spectra, intensities, v1_impl=False):
    """Reimplementation of pyImagingMSpec.image_measures.isotope_image_correlation supporting
    a variable denominator when calculating the corrcoef (to compensate for the removed zero-valued
    pixels). This allows it to work on images that have had empty areas removed, without impacting
    the results, which can improve speed significantly.

    This returns values that can be very slightly different from the original pyImagingMSpec due to
    floating point imprecision, but the results never seemed to differ by more than 0.0000001.
    Specify v1_impl=True to use the original pyImagingMSpec implementation.
    """

    if v1_impl:
        # Ignore div-by-zero / NaN errors - they're handled internally
        with np.errstate(divide='ignore', invalid='ignore'):
            if np.sum(intensities[1:]) == 0:
                return 0
            else:
                return isotope_image_correlation(iso_imgs_flat, weights=intensities[1:])

    if (
        len(iso_imgs_flat) < 2
        or np.count_nonzero(iso_imgs_flat[0]) < 2
        or np.sum(intensities[1:]) == 0
    ):
        return 0

    iso_imgs_flat = iso_imgs_flat[:, iso_imgs_flat.any(axis=0)]

    iso_correlation = spatial_corr(iso_imgs_flat, n_spectra, None)

    try:
        # coerce between [0 1]
        return np.clip(np.average(iso_correlation, weights=intensities[1:]), 0, 1)
    except TypeError as exc:
        raise ValueError("Number of images is not equal to the number of weights + 1") from exc


def spatial_corr(iso_imgs_flat, n_spectra, weights=None):
    """Reimplementation of pyImagingMSpec.image_measures.isotope_image_correlation supporting
    a variable denominator when calculating the corrcoef (to compensate for the removed zero-valued
    pixels).
    """
    if weights is not None:
        # Calculate np.cov (with weights)
        weights = weights / np.sum(weights)
        # iso_imgs_weighted = iso_imgs_flat * weights[np.newaxis, :]
        # iso_imgs_flat = iso_imgs_flat / np.sum(iso_imgs_flat, axis=0)[:, np.newaxis]
        avg = np.sum(iso_imgs_flat * weights[np.newaxis, :], axis=1, keepdims=True)
        X = iso_imgs_flat - avg
        # Only the diagonal and left column of the covariance matrix are needed
        covdiag = np.sum(X * X * weights, axis=1)
        covleft = np.sum(X[0:1] * X * weights, axis=1)
    else:
        # Calculate np.cov (with custom denominator)
        avg = np.sum(iso_imgs_flat, axis=1) / n_spectra
        X = iso_imgs_flat - avg[:, np.newaxis]
        padding = n_spectra - iso_imgs_flat.shape[1]
        # Only the diagonal and left column of the covariance matrix are needed
        covdiag = (np.sum(X * X, axis=1) + (avg * avg * padding)) / (n_spectra - 1)
        covleft = (np.sum(X[0:1] * X, axis=1) + (avg[0] * avg * padding)) / (n_spectra - 1)
    # Calculate np.corrcoef from np.cof results
    # iso_correlation = np.corrcoef(flt_images_flat)[1:, 0]
    with np.errstate(divide='ignore', invalid='ignore'):
        iso_correlation = covleft[1:] / np.sqrt(covdiag[0] * covdiag[1:])
    # When all values are the same (e.g. zeros) then the covariance matrix can have zeros or nans.
    # Replace these with 0s to avoid downstream errors
    iso_correlation[np.isinf(iso_correlation) | np.isnan(iso_correlation)] = 0
    return iso_correlation


def _chaos_dilate(arr):
    """NOTE: This mutates the input. It's equivalent to
    scipy.ndimage.binary_dilation(arr, iterations=2), but it's about 10x faster.
    It dilates a row/col mask such that the masked image will get the same measure of chaos score,
    as measure-of-chaos does its own dilation on the image which can cause connected regions
    to merge if gaps in the image are made too small.
    """
    arr = arr.copy()
    arr[1:] |= arr[:-1]
    arr[1:] |= arr[:-1]
    arr[:-2] |= arr[2:]
    if np.count_nonzero(arr) >= 0.9 * len(arr):
        # Not sparse enough to justify compaction - return a slice so that numpy can skip copying
        return slice(None)
    else:
        return arr


def chaos_metric(iso_img, n_levels):
    # Shrink image if possible, as chaos performance is highly resolution-dependent
    iso_img = iso_img[_chaos_dilate(np.any(iso_img, axis=1)), :]
    iso_img = iso_img[:, _chaos_dilate(np.any(iso_img, axis=0))]

    if iso_img.size == 0:
        # measure_of_chaos segfaults if the image has no elements - in Lithops this appears as a
        # MemoryError. Skip empty images.
        return 0

    # measure_of_chaos behaves weirdly on Fortran-ordered arrays, which happen sometimes due to the
    # above slicing operations. this makes it a C-ordered, aligned copy if needed.
    iso_img = np.require(iso_img, requirements=['A', 'C'])

    moc = measure_of_chaos(iso_img, n_levels)
    return 0 if np.isclose(moc, 1.0) else moc


def v2_chaos(iso_img, n_levels=30, geom_scaling=False, full_dilate=False):
    # GCOVR_EXCL_START  # Disable code coverage for this function as it's not prod code
    """
    WIP code for experimenting with improvements to the measure of chaos metric.

    Arguments:
        iso_img: first isotopic image
        n_levels: number of intensity thresholds to sample at.
        geom_scaling: whether to use geometric scaling instead of linear scaling for selecting
                      the intensity thresholds
        full_dilate: whether to do an 8-way dilation instead of a 4-way dilation, which causes
                     small islands of 1-2 pixels to be kept

    This returns 2 candidate metric values: the ratio-based metric and the count-based metric
    Only one metric value is expected to actually be used in the end. They're just all calculated in
    parallel because it's faster to do them in parallel the optimal method hasn't been decided yet.

    The "count-based" values match the old algorithm - it's the mean number of connected components
        divided by the total number of pixels with non-zero intensity.
    The "ratio-based" values are the potentially improved version - it calculates the ratio of
        connected components to pixels at every intensity threshold. This should work better on
        images that have a several regions of different intensities.
    Linear vs log-scaling are just different ways to choose the intensity thresholds where connected
        components are counted. n_levels directly affects performance, so choosing better thresholds
        would allow the n_levels to be reduced. Log-scaling usually makes more sense with mass spec
        intensities.

    Findings:
        * This python reimplementation is faster than the C++ implementation as long as numba is
          used to accelerate count_connected_components
        * full_dilate doesn't seem to help. It's also much slower
        * n_levels=10, geom_scaling=True is much faster than n_levels=30, geom_scaling=False
          and gives very similar results. It's probably a worthwhile change



    Original implementation:
    https://github.com/alexandrovteam/ims-cpp/blob/dcc12b4c50dbfdcde3f765af85fb8b3bb5cd7ec3/ims/image_measures.cpp#L89
    Old way: level-thresholding -> dilation -> erosion -> connected component count
    New way: "dilation" via maximum-filter -> "erosion" via minimum-filter -> level-thresholding
             -> connected component count

    """

    # Local import of image_manip because numba isn't included in the Lithops Docker image
    # as it adds ~25MB. If this metric is ever used again, numba will need to be added to the image.
    # pylint: disable=import-outside-toplevel  # Avoid pulling numba into lithops
    from sm.engine.annotation.image_manip import count_connected_components

    if full_dilate:
        iso_img = grey_closing(iso_img, size=(3, 3))
    else:
        dilated = maximum_filter(iso_img, footprint=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
        # Old way: mode='nearest', new way: mode='constant'
        iso_img = minimum_filter(dilated, size=(3, 3), mode='constant')

    if not iso_img.any():
        # Old way - detect this case when the return value is exactly 1.0
        return [0.0, 0.0]

    # Old way: np.linspace(0, max_ints, n_levels)
    mask = np.empty(iso_img.shape, dtype='bool')

    def calc_chaos_metrics(thresholds):
        if len(thresholds):
            pixel_counts = np.ones(len(thresholds), 'i')
            component_counts = np.zeros(len(thresholds), 'i')
            for i, threshold in enumerate(thresholds):
                np.greater(iso_img, threshold, out=mask)
                if mask.any():
                    pixel_counts[i] = np.count_nonzero(mask)
                    component_counts[i] = count_connected_components(mask)

            mean_ratio = 1 - np.mean((component_counts / pixel_counts)[component_counts > 0])
            mean_count = 1 - np.mean(component_counts) / np.count_nonzero(iso_img)

            return [mean_ratio, mean_count]
        else:
            return [-1.0, -1.0]

    max_ints = np.max(iso_img)
    if geom_scaling:
        levels = np.geomspace(max_ints / 1000, max_ints, n_levels, endpoint=False)
    else:
        levels = np.linspace(0, max_ints, n_levels, endpoint=False)
    return calc_chaos_metrics(levels)
    # GCOVR_EXCL_STOP


def v2_chaos_orig(iso_img, n_levels=30):
    # GCOVR_EXCL_START  # Disable code coverage for this function as it's not prod code
    """Reimplementation of the chaos metric. I didn't manage to get it to exactly match the original
    implementation. This one seems to have significantly better dynamic range - it often produces
    values like 0.6 when the original implementation rarely produces values below 0.95

    Original implementation:
    https://github.com/alexandrovteam/ims-cpp/blob/dcc12b4c50dbfdcde3f765af85fb8b3bb5cd7ec3/ims/image_measures.cpp#L89
    Old way: level-thresholding -> dilation -> erosion -> connected component count
    New way: "dilation" via maximum-filter -> "erosion" via minimum-filter -> level-thresholding
             -> connected component count
    """
    # Local import of image_manip because numba isn't included in the Lithops Docker image
    # as it adds ~25MB. If this metric is ever used again, numba will need to be added to the image.
    # pylint: disable=import-outside-toplevel  # Avoid pulling numba into lithops
    from sm.engine.annotation.image_manip import count_connected_components

    dilated = maximum_filter(iso_img, footprint=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    # Old way: mode='nearest', new way: mode='constant'
    iso_img = minimum_filter(dilated, size=(3, 3), mode='nearest')

    if not iso_img.any():
        # Old way - detect this case when the return value is exactly 1.0
        return 0.0

    # Old way: np.linspace(0, max_ints, n_levels)
    mask = np.empty(iso_img.shape, dtype='bool')

    thresholds = np.linspace(0, np.max(iso_img), n_levels)

    pixel_counts = np.ones(len(thresholds), 'i')
    component_counts = np.zeros(len(thresholds), 'i')
    for i, threshold in enumerate(thresholds):
        np.greater(iso_img, threshold, out=mask)
        if mask.any():
            pixel_counts[i] = np.count_nonzero(mask)
            component_counts[i] = count_connected_components(mask)

    mean_count = 1 - np.mean(component_counts) / np.count_nonzero(iso_img)

    return mean_count
    # GCOVR_EXCL_STOP


def weighted_stddev(values, weights):
    # Numpy's weighted average is extremely dependent on the order of items, and gives inconsistent
    # results even with 64-bit precision. np.longdouble (80-bit precision on x86 platforms)
    # significantly reduces the order-dependent error, but beware that results may still differ
    # depending on how the input values are ordered.
    # The Spark and Lithops pipelines often collect pixels into a coo_matrix in a different order.
    values = values.astype(np.longdouble)
    weights = weights.astype(np.longdouble)

    average = np.average(values, weights=weights)
    stddev = np.sqrt(np.average((values - average) ** 2, weights=weights))
    return average.astype(np.float64), stddev.astype(np.float64)


def calc_mz_stddev(iso_images_sparse, iso_mzs_sparse, formula_mzs):
    mz_mean = []
    mz_stddev = []
    for ints_img, mzs_img, theo_mz in zip(iso_images_sparse, iso_mzs_sparse, formula_mzs):
        if mzs_img is not None and mzs_img.nnz > 0:
            mz, stddev = weighted_stddev(mzs_img.data, ints_img.data)
            mz_mean.append(mz)
            mz_stddev.append(stddev)
        else:
            mz_mean.append(theo_mz)
            mz_stddev.append(0.0)
    return mz_mean, mz_stddev


def calc_mass_errs(mz_mean, formula_mzs, formula_ints):
    mz_err_abs = mz_mean[0] - formula_mzs[0]
    if formula_ints[1:].sum() > 0:
        mz_err_rel = np.average(
            (mz_mean[1:] - formula_mzs[1:] - mz_err_abs), weights=formula_ints[1:]
        )
    else:
        mz_err_rel = 0

    return mz_err_abs, mz_err_rel


def mass_metrics(iso_images_sparse, iso_mzs_sparse, formula_mzs, formula_ints):
    formula_mzs = np.asarray(formula_mzs)
    formula_ints = np.asarray(formula_ints)
    mz_mean, mz_stddev = calc_mz_stddev(iso_images_sparse, iso_mzs_sparse, formula_mzs)
    mz_err_abs, mz_err_rel = calc_mass_errs(mz_mean, formula_mzs, formula_ints)

    return mz_mean, mz_stddev, mz_err_abs, mz_err_rel
