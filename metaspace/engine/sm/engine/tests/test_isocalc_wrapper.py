import pytest
import numpy as np
from numpy.testing import assert_array_almost_equal

from tests.conftest import ds_config
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper, mass_accuracy_half_width


@pytest.mark.parametrize('formula, adduct', [('', '+H'), ('4Sn', '+K'), ('C4', '-H')])
def test_centroids_wrong_formula_adduct(ds_config, formula, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config)
    mzs, ints = isocalc_wrapper.centroids(formula + adduct)
    assert mzs is None, ints is None


@pytest.mark.parametrize('formula, adduct', [('H', '+H'), ('C8H20NO6P', '+K')])
def test_centroids_number(ds_config, formula, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config)
    mzs, ints = isocalc_wrapper.centroids(formula + adduct)

    assert mzs is not None and ints is not None
    assert len(mzs) == len(ints) == 4


def test_centroids_h20(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config)
    mzs, ints = isocalc_wrapper.centroids('H2O+H')

    assert_array_almost_equal(mzs, np.array([19.018, 20.022, 20.024, 21.022]), decimal=3)
    assert_array_almost_equal(ints, np.array([1.00e02, 3.83e-02, 3.48e-02, 2.06e-01]), decimal=2)


def test_mass_accuracy_half_width():
    mzs = np.array([100.0, 200.0, 400.0, 800.0, 1600.0])
    # ppm_widths are the instrument-specific peak widths in Da for the above mzs assuming a peak is 1ppm wide at 200
    tof_ppm_width = np.array([0.5, 1.0, 2.0, 4.0, 8.0]) * 200e-6
    orbi_ppm_width = np.power(np.array([0.5, 1.0, 2.0, 4.0, 8.0]), 1.5) * 200e-6
    fticr_ppm_width = np.power(np.array([0.5, 1.0, 2.0, 4.0, 8.0]), 2.0) * 200e-6

    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'TOF', 1.0), tof_ppm_width)
    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'TOF', 3.0), tof_ppm_width * 3.0)
    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'Orbitrap', 1.0), orbi_ppm_width)
    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'Orbitrap', 3.0), orbi_ppm_width * 3.0)
    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'FTICR', 1.0), fticr_ppm_width)
    assert_array_almost_equal(mass_accuracy_half_width(mzs, 'FTICR', 3.0), fticr_ppm_width * 3.0)
