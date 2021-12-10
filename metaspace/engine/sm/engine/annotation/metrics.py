import numpy as np
from cpyImagingMSpec import measure_of_chaos
from pyImagingMSpec.image_measures import isotope_pattern_match
from scipy.ndimage import maximum_filter, minimum_filter, grey_closing
from scipy.stats import spearmanr

from sm.engine.annotation.image_manip import count_connected_components, compact_empty_space


def v1_spatial(iso_imgs_flat, n_spectra, intensities, weights=None, force_pos=False):
    """Reimplementation of pyImagingMSpec.image_measures.isotope_image_correlation supporting
    a variable denominator when calculating the corrcoef (to compensate for the removed zero-valued
    pixels).
    """
    if (
        len(iso_imgs_flat) < 2
        or np.count_nonzero(iso_imgs_flat[0]) < 2
        or np.sum(intensities[1:]) == 0
    ):
        return 0

    iso_correlation = spatial_corr(iso_imgs_flat, n_spectra, weights)
    if force_pos:
        iso_correlation = np.clip(iso_correlation, 0, 1)

    try:
        # coerce between [0 1]
        return np.clip(np.average(iso_correlation, weights=intensities[1:]), 0, 1)
    except TypeError:
        raise ValueError("Number of images is not equal to the number of weights + 1")


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
    iso_correlation = covleft[1:] / np.sqrt(covdiag[0] * covdiag[1:])
    # when all values are the same (e.g. zeros) then correlation is undefined
    iso_correlation[np.isinf(iso_correlation) | np.isnan(iso_correlation)] = 0
    return iso_correlation


def v2_spatial_spearman(imgs, intensities):
    if not (intensities > 0).all():
        imgs = imgs[intensities > 0]
        intensities = intensities[intensities > 0]

    corr_mat = spearmanr(imgs.T).correlation
    if np.isscalar(corr_mat):
        if np.isnan(corr_mat):
            # When all images are constant, spearmanr returns a scalar nan
            return 1
        else:
            # When there are only 2 images, spearmanr returns a scalar
            return (corr_mat + 1) / 2
    else:
        corr = np.average(np.nan_to_num(corr_mat[0, 1:]), weights=np.nan_to_num(intensities[1:]))
        return (corr + 1) / 2


def weighted_stddev(values, weights):
    average = np.average(values, weights=weights)
    stddev = np.sqrt(np.average((values - average) ** 2, weights=weights))
    return average, stddev


def v1_chaos(iso_img, n_levels):
    # Shrink image if possible, as chaos performance is highly resolution-dependent
    iso_img = compact_empty_space(iso_img)

    if iso_img.size == 0:
        # measure_of_chaos segfaults if the image has no elements
        return 0

    # iso_img = np.require(iso_img, dtype='f', requirements=['C', 'A'])
    moc = measure_of_chaos(iso_img, n_levels)
    return 0 if np.isclose(moc, 1.0) else moc


def v2_chaos(iso_img, lin_levels=30, geom_levels=30, full_dilate=False):
    # Original implementation: https://github.com/alexandrovteam/ims-cpp/blob/dcc12b4c50dbfdcde3f765af85fb8b3bb5cd7ec3/ims/image_measures.cpp#L89
    # Old way: level-thresholding -> dilation -> erosion -> connected component count
    # New way: "dilation" via maximum-filter -> "erosion" via minimum-filter -> level-thresholding -> connected component count
    if full_dilate:
        iso_img = grey_closing(iso_img, size=(3, 3))
    else:
        dilated = maximum_filter(iso_img, footprint=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
        # Old way: mode='nearest', new way: mode='constant'
        iso_img = minimum_filter(dilated, size=(3, 3), mode='constant')

    if not iso_img.any():
        # Old way - detect this case when the return value is exactly 1.0
        return [0.0, 0.0, 0.0, 0.0]

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

            return mean_ratio, mean_count
        else:
            return -1.0, -1.0

    max_ints = np.max(iso_img)
    lin_ratio, lin_count = calc_chaos_metrics(np.linspace(0, max_ints, lin_levels, endpoint=False))
    geom_ratio, geom_count = calc_chaos_metrics(
        np.geomspace(max_ints / 1000, max_ints, geom_levels, endpoint=False)
    )

    return [lin_ratio, lin_count, geom_ratio, geom_count]


def v1_spectral(iso_imgs_flat, formula_ints):
    return isotope_pattern_match(iso_imgs_flat, formula_ints)


def weighted_stddev(values, weights):
    average = np.average(values, weights=weights)
    stddev = np.sqrt(np.average((values - average) ** 2, weights=weights))
    return average, stddev


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
            mz_stddev.append(0)
    return np.float32(mz_mean), np.float32(mz_stddev)
