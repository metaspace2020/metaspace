import numpy as np
import scipy.stats
from scipy import ndimage
from scipy.optimize import curve_fit

from imutils import nan_to_zero

# try to use cv2 for faster image processing
try:
    import cv2

    cv2.connectedComponents  # relatively recent addition, so check presence
    opencv_found = True
except (ImportError, AttributeError):
    opencv_found = False


def measure_of_chaos(im, nlevels, overwrite=True, statistic=None):
    """
    Compute a measure for the spatial chaos in given image using the level sets method.

    :param im: 2d array
    :param nlevels: how many levels to use
    :type nlevels: int
    :param overwrite: Whether the input image can be overwritten to save memory
    :type overwrite: bool
    :param statistic: callable that calculates a score (a number) for the object counts in the level sets. If
    specified, this statistic will be used instead of the default one. The callable must take two arguments - the
    object counts (sequence of ints) and the number of non-zero pixels in the original image (int) - and output a number
    :return: the measured value
    :rtype: float
    :raises ValueError: if nlevels <= 0 or q_val is an invalid percentile or an unknown interp value is used
    """
    statistic = statistic or _default_measure
    # don't process empty images
    if np.sum(im) == 0:
        return np.nan
    sum_notnull = np.sum(im > 0)
    # reject very sparse images
    if sum_notnull < 4:
        return np.nan

    if not overwrite:
        # don't modify original image, make a copy
        im = im.copy()

    notnull_mask = nan_to_zero(im)
    im_clean = im / np.max(im)  # normalize to 1

    # Level Sets Calculation
    object_counts = _level_sets(im_clean, nlevels)
    return statistic(object_counts, sum_notnull)


def measure_of_chaos_fit(im, nlevels, overwrite=True):
    """
    This function is identical to measure_of_chaos except that it uses a different statistic.
    """
    return measure_of_chaos(im, nlevels, overwrite=overwrite, statistic=_fit)


def _dilation_and_erosion(im, dilate_mask=None, erode_mask=None):
    dilate_mask = dilate_mask or [[0, 1, 0], [1, 1, 1], [0, 1, 0]]
    erode_mask = erode_mask or [[1, 1, 1], [1, 1, 1], [1, 1, 1]]
    if opencv_found:
        cv2.dilate(im, dilate_mask)
        cv2.erode(im, erode_mask)
        return im
    return ndimage.binary_erosion(ndimage.morphology.binary_dilation(im, structure=dilate_mask), structure=erode_mask)


def _level_sets(im_clean, nlevels, prep=_dilation_and_erosion):
    """
    Divide the image into level sets and count the number of objects in each of them.

    :param im_clean: 2d array with :code:`im_clean.max() == 1`
    :param int nlevels: number of levels to search for objects (positive integer)
    :param prep: callable that takes a 2d array as its only argument and returns a 2d array
    :return: sequence with the number of objects in each respective level
    """
    if nlevels <= 0:
        raise ValueError("nlevels must be positive")
    prep = prep or (lambda x: x)  # if no preprocessing should be done, use the identity function

    # TODO change the levels. Reason:
    #  - in the for loop, the > operator is used. The highest level is 1, therefore the highest level set will always
    #    be empty. The ndimage.label function then returns 1 as the number of objects in the empty image, although it
    #    should be zero.
    # Proposed solution:
    # levels = np.linspace(0, 1, nlevels + 2)[1:-1]
    # That is, create nlevels + 2 levels, then throw away the zero level and the one level
    # or:
    # levels = np.linspace(0, 1, nlevels)[1:-1]
    # That is, only use nlevels - 2 levels. This means that the output array will have a size of nlevels - 2
    levels = np.linspace(0, 1, nlevels)  # np.amin(im), np.amax(im)
    # Go through levels and calculate number of objects
    num_objs = []
    count_func = (lambda im: cv2.connectedComponents(im)[0] - 1) if opencv_found else (lambda im: ndimage.label(im)[1])
    for lev in levels:
        # Threshold at level
        bw = (im_clean > lev)
        bw = prep(bw)
        # Record objects at this level
        num_objs.append(count_func(bw))
    return num_objs


def _default_measure(num_objs, sum_notnull):
    """
    Calculate a statistic for the object counts.

    :param num_objs: number of objects found in each level, respectively
    :param float sum_notnull: sum of all non-zero elements in the original array (positive number)
    :return: the calculated value between 0 and 1, bigger is better
    """
    num_objs = np.asarray(num_objs, dtype=np.int_)
    if np.unique(num_objs).shape[0] <= 1:
        return np.nan

    nlevels = len(num_objs)
    if min(num_objs) < 0:
        raise ValueError("cannot have negative object counts")
    if nlevels < 1:
        raise ValueError("array of object counts is empty")

    sum_vals = float(np.sum(num_objs))
    return 1 - sum_vals / (sum_notnull * nlevels)


# this updates the scoring function from the main algorithm.
def _fit(num_objs, _):
    """
    An alternative statistic for measure_of_chaos.

    :param num_objs: number of objects found in each level, respectively
    :param _: unused dummy parameter, kept for signature compatibility with _default_measure
    :return: the calculated value
    """
    if np.unique(num_objs).shape[0] < 2:
        return np.nan

    num_objs = np.asarray(num_objs, dtype=np.int_)
    nlevels = len(num_objs)
    if min(num_objs) < 0:
        raise ValueError("must have at least one object in each level")
    if nlevels < 1:
        raise ValueError("array of object counts is empty")

    def func(x, a, b):
        return scipy.stats.norm.cdf(x, loc=a, scale=b)

    # measure_value, im, levels, num_objs = measure_of_chaos(im, nlevels)
    # if measure_value == np.nan:  # if basic algorithm failed then we're going to fail here too
    #     return np.nan
    cdf_curve = np.cumsum(num_objs) / float(np.sum(num_objs))
    popt, pcov = curve_fit(func, np.linspace(0, 1, nlevels), cdf_curve, p0=(0.5, 0.05))
    pdf_fitted = func(np.linspace(0, 1, nlevels), popt[0], popt[1])
    # return 1-np.sqrt(np.sum((pdf_fitted - cdf_curve)**2))
    return 1 - np.sum(np.abs((pdf_fitted - cdf_curve)))


def isotope_pattern_match(images_flat, theor_iso_intensities):
    """
    This function calculates a match between a list of isotope ion images and a theoretical intensity vector.

    :param images_flat: 2d array (or sequence of 1d arrays) of pixel intensities with shape (d1, d2) where d1 is the number of images and d2 is the number of pixels per image, i.e. :code:`images_flat[i]` is the i-th flattened image
    :param theor_iso_intensities: 1d array (or sequence) of theoretical isotope intensities with shape d1, i.e :code:`theor_iso_intensities[i]` is the theoretical isotope intensity corresponding to the i-th image
    :return: measure value between 0 and 1, bigger is better
    :rtype: float
    :raise TypeError: if images are not 1d
    :raise ValueError: if images are not equally shaped or if the number of images and the number of intensities differ
    """
    d1 = len(images_flat)
    if d1 != len(theor_iso_intensities):
        raise ValueError("amount of images and theoretical intensities must be equal")
    if any(np.shape(im) != np.shape(images_flat[0]) for im in images_flat):
        raise ValueError("images are not equally sized")
    if any(len(np.shape(im)) != 1 for im in images_flat):
        raise TypeError("images are not 1d")
    if any(intensity < 0 for intensity in theor_iso_intensities):
        raise ValueError("intensities must be >= 0")

    image_ints = []
    not_null = images_flat[0] > 0
    for ii, _ in enumerate(theor_iso_intensities):
        image_ints.append(np.sum(images_flat[ii][not_null]))
    pattern_match = 1 - np.mean(abs(theor_iso_intensities / np.linalg.norm(theor_iso_intensities) -
                                    image_ints / np.linalg.norm(image_ints)))
    if pattern_match == 1.:
        return 0
    return pattern_match


def isotope_image_correlation(images_flat, weights=None):
    """
    Function for calculating a weighted average measure of image correlation with the principle image.

    :param images_flat: 2d array (or sequence of 1d arrays) of pixel intensities with shape (d1, d2) where d1 is the number of images and d2 is the number of pixels per image, i.e. :code:`images_flat[i]` is the i-th flattened image
    :param weights: 1d array (or sequence) of weights with shape (d1 - 1), i.e :code:`weights[i]` is the weight to put on the correlation between the first and the i-th image. If omitted, all correlations are weighted equally
    :return: measure_value (zero if less than 2 images are given)
    :raise TypeError: if images are not 1d
    :raise ValueError: if images are not equally shaped or if the number of correlations and the number of weights (if given) differ
    """
    if len(images_flat) < 2:
        return 0
    if any(len(np.shape(im)) != 1 for im in images_flat):
        raise TypeError("images are not 1d")
    else:
        # slightly faster to compute all correlations and pull the elements needed
        iso_correlation = np.corrcoef(images_flat)[1:, 0]
        # when all values are the same (e.g. zeros) then correlation is undefined
        iso_correlation[np.isinf(iso_correlation)] = 0
        try:
            return np.average(iso_correlation, weights=weights)
        except TypeError:
            raise ValueError("Number of images is not equal to the number of weights + 1")
