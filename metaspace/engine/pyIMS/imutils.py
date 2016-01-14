import numpy as np
from scipy import interpolate as interpolate_


def nan_to_zero(im):
    """
    Set all values to zero that are less than zero or nan; return the indices of all elements that are zero after
    the modification (i.e. those that have been nan or smaller than or equal to zero before calling this function). The
    returned boolean array has the same shape, False denotes that a value is zero now.

    :param im: the array which nan-values will be set to zero in-place
    :return: A boolean array of the same shape as :code:`im`
    """
    if im is None:
        raise AttributeError("im must be an array, not None")
    notnull = im > 0  # does not include nan values
    if notnull is True:
        raise TypeError("im must be an array")
    im[~notnull] = 0
    return notnull


def quantile_threshold(im, q_val, notnull_mask=None):
    """
    Set all values greater than the :code:`q_val`-th percentile to the :code:`q_val`-th percentile (i.e. flatten out
    everything greater than the :code:`q_val`-th percentile). For determining the percentile, only nonzero pixels are
    taken into account, that is :code:`im[notnull_mask]`.

    :param im: the array to remove the hotspots from
    :param q_val: percentile to use
    :param notnull_mask: index array for the values greater than zero. If None, no mask is used
    :return: The :code:`q_val`-th percentile
    """
    notnull_mask = np.ones(np.shape(im)) if notnull_mask is None else notnull_mask
    im_q = np.percentile(im[notnull_mask], q_val)
    im_rep = im > im_q
    im[im_rep] = im_q
    return im_q


def interpolate(im, notnull_mask=None):
    """
    Use spline interpolation to fill in missing values.

    :param im: the entire image, including nan or zero values
    :param notnull_mask: index array for the values greater than zero. If None, no mask is used
    :return: the interpolated array
    """
    notnull_mask = np.ones(np.shape(im)) if notnull_mask is None else notnull_mask
    im_size = im.shape
    X, Y = np.meshgrid(np.arange(0, im_size[1]), np.arange(0, im_size[0]))
    f = interpolate_.interp2d(X[notnull_mask], Y[notnull_mask], im[notnull_mask])
    im = f(np.arange(0, im_size[1]), np.arange(0, im_size[0]))
    return im
