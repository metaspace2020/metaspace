import pytest
import numpy as np
from numpy.testing import assert_array_almost_equal
from pyMSpec.pyisocalc.periodic_table import periodic_table

import sm.engine.isotope_labels  # noqa: F401 — ensure periodic table is patched before tests

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


def test_centroids_labeled_element_mz_shift(ds_config):
    """13C-labelled glucose [U-13C6] should be exactly 6 * (M_13C - M_12C) higher than
    natural-isotope glucose in m/z."""
    isocalc_wrapper = IsocalcWrapper(ds_config)

    # Natural glucose +H: C6H12O6 → ion formula C6H13O6 (after adduct applied upstream)
    # Labelled glucose +H: Cx6H12O6 → ion formula H13O6Cx6
    mzs_natural, ints_natural = isocalc_wrapper.centroids('C6H13O6')
    mzs_labeled, ints_labeled = isocalc_wrapper.centroids('H13O6Cx6')

    assert mzs_natural is not None, 'natural glucose centroids should not be None'
    assert mzs_labeled is not None, '13C-glucose centroids should not be None'

    # Expected m/z shift: 6 × (M_13C − M_12C)
    M_12C = periodic_table['C'][2][0]  # 12.0 (exactly)
    M_13C = periodic_table['Cx'][2][0]  # 13.00335484
    expected_shift = 6 * (M_13C - M_12C)

    # The monoisotopic (highest-intensity) peak carries the shift.
    mono_natural = mzs_natural[np.argmax(ints_natural)]
    mono_labeled = mzs_labeled[np.argmax(ints_labeled)]
    assert mono_labeled - mono_natural == pytest.approx(expected_shift, abs=1e-4)


def test_centroids_unlabeled_formula_unchanged(ds_config):
    """Formulas without X must produce the same centroids as before."""
    isocalc_wrapper = IsocalcWrapper(ds_config)
    mzs, ints = isocalc_wrapper.centroids('H2O+H')
    assert_array_almost_equal(mzs, np.array([19.018, 20.022, 20.024, 21.022]), decimal=3)


def test_centroids_all_labeled_returns_none(ds_config):
    """A formula made entirely of labeled atoms has no natural-isotope backbone
    and must return (None, None) rather than crash."""
    isocalc_wrapper = IsocalcWrapper(ds_config)
    mzs, ints = isocalc_wrapper.centroids('Cx6')
    assert mzs is None and ints is None


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
