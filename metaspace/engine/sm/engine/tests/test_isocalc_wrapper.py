from mock import patch, MagicMock
import numpy as np
from numpy.testing import assert_array_almost_equal

from sm.engine.isocalc_wrapper import IsocalcWrapper, Centroids, trim_centroids
from sm.engine.tests.util import ds_config


def test_isocalc_wrapper_get_iso_peaks_wrong_sf_adduct(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    assert isocalc_wrapper.isotope_peaks(None, '+H').empty
    assert isocalc_wrapper.isotope_peaks('Au', None).empty


def test_trim_centroids_takes_first_n_centr_by_intensity():

    def check(mzs, ints, n, tr_mzs, tr_ints):
        _mzs, _ints = trim_centroids(mzs, ints, n)
        assert_array_almost_equal(_mzs, tr_mzs)
        assert_array_almost_equal(_ints, tr_ints)

    check(np.array([100., 200., 300.]), np.array([100., 1., 20.]), 2,
          np.array([100., 300.]), np.array([100., 20.]))

    check(np.array([100., 200., 300.]), np.array([100., 100., 2.]), 2,
          np.array([100., 200.]), np.array([100., 100.]))

    check(np.array([100., 200., 300.]), np.array([0., 1., 2.]), 2,
          np.array([200., 300.]), np.array([1., 2.]))


def test_isotopic_patterns_h20(ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centroids = isocalc.isotope_peaks('H20', '+H')

    assert_array_almost_equal(centroids.mzs, np.array([21.1638, 22.1701]), decimal=3)
    assert_array_almost_equal(centroids.ints, np.array([100.00, 0.24]), decimal=2)
