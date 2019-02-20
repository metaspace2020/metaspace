import pytest
import numpy as np
import pandas as pd
from numpy.testing import assert_array_almost_equal

from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N
from sm.engine.tests.util import ds_config


@pytest.mark.parametrize('formula, adduct', [
    ('', '+H'),
    ('Np', '+H'),
    ('4Sn', '+K'),
    ('C4', '-H'),
])
def test_centroids_wrong_formula_adduct(ds_config, formula, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.centroids(formula + adduct)
    assert mzs is None, ints is None


@pytest.mark.parametrize('formula, adduct', [
    ('H', '+H'),
    ('C8H20NO6P', '+K'),
])
def test_centroids_number(ds_config, formula, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.centroids(formula + adduct)

    assert mzs is not None and ints is not None
    assert len(mzs) == len(ints) == ISOTOPIC_PEAK_N


def test_centroids_h20(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    mzs, ints = isocalc_wrapper.centroids('H2O+H')

    assert_array_almost_equal(mzs, np.array([19.018, 20.022, 20.024, 21.022]), decimal=3)
    assert_array_almost_equal(ints, np.array([1.00e+02, 3.83e-02, 3.48e-02, 2.06e-01]), decimal=2)
