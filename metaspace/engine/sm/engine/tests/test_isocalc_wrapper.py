import pytest
import numpy as np
from numpy.testing import assert_array_almost_equal

from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N, Ion, IonCentroids, Centroids
from sm.engine.tests.util import ds_config


@pytest.mark.parametrize("sf, adduct", [
    (None, '+H'),
    ('Au', None),
    ('Np', '+H'),
    ('4Sn', '+K'),
])
def test_isocalc_wrapper_get_iso_peaks_wrong_sf_adduct(ds_config, sf, adduct):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    centroids = isocalc_wrapper.isotope_peaks(Ion(sf, adduct))
    assert len(centroids.mzs) == len(centroids.ints) == 0


def test_isotopic_pattern_h20(ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centroids = isocalc.isotope_peaks(Ion('H2O', '+H'))

    assert_array_almost_equal(centroids.mzs, np.array([19.018,  20.023,  21.023]), decimal=3)
    assert_array_almost_equal(centroids.ints, np.array([100.,   0.072,   0.205]), decimal=2)


def test_isotopic_pattern_has_n_peaks(ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centroids = isocalc.isotope_peaks(Ion('C8H20NO6P', '+K'))

    assert len(centroids.mzs) == ISOTOPIC_PEAK_N
    assert len(centroids.ints) == ISOTOPIC_PEAK_N


def test_isotopic_patterns_format_peaks(ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    ion_centr = IonCentroids(Ion('H2O', '+H'), Centroids([100., 200.], [100., 10.]))
    peak_line = isocalc.format_peaks(ion_centr)

    exp_peak_line = 'H2O\t+H\t%.6f\t%d\t%d\t{100.000000,200.000000}\t{100.000000,10.000000}' % \
                    (round(isocalc.sigma, 6), isocalc.charge, isocalc.pts_per_mz)
    assert peak_line == exp_peak_line
