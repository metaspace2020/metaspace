import pytest
import numpy as np
import pandas as pd
from numpy.testing import assert_array_almost_equal

from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N
from sm.engine.tests.util import ds_config


@pytest.mark.parametrize("sf, adduct", [
    (None, '+H'),
    ('Au', None),
    ('Np', '+H'),
    ('4Sn', '+K'),
])
def test_isocalc_wrapper_get_iso_peaks_wrong_sf_adduct(ds_config, sf, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.ion_centroids(sf, adduct)
    assert mzs is None, ints is None


def test_isotopic_pattern_h20(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.ion_centroids('H2O', '+H')

    assert_array_almost_equal(mzs, np.array([19.018,  20.023,  21.023]), decimal=3)
    assert_array_almost_equal(ints, np.array([100.,   0.072,   0.205]), decimal=2)


def test_isotopic_pattern_has_n_peaks(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.ion_centroids('C8H20NO6P', '+K')

    assert len(mzs) == ISOTOPIC_PEAK_N
    assert len(ints) == ISOTOPIC_PEAK_N
