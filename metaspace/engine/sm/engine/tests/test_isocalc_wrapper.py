import numpy as np
from mock import patch, MagicMock
from pyMSpec.mass_spectrum import MassSpectrum

from sm.engine.isocalc_wrapper import IsocalcWrapper, Centroids
from sm.engine.tests.util import ds_config


@patch('sm.engine.isocalc_wrapper.complete_isodist')
def test_isocalc_wrapper_get_iso_peaks_wrong_sf_adduct(isocalc_isodist, ds_config):

    def get_spectrum_side_effect(source):
        if source == 'centroids':
            return np.array([100., 200.]), np.array([100., 10.])
        elif source == 'profile':
            return (np.array([0, 90., 95., 99., 100., 101., 105., 110.,
                              190., 195., 199., 200., 201., 205., 210., 100500.]),
                    np.array([0, 10., 50., 90., 100., 90., 50., 10.,
                              1., 5., 9., 10., 9., 5., 1., 100500.]))

    mock_mass_sp = MagicMock(spec=MassSpectrum)
    mock_mass_sp.get_spectrum.side_effect = get_spectrum_side_effect
    isocalc_isodist.return_value = mock_mass_sp

    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    emtpy_iso_dict = Centroids([], [])
    assert isocalc_wrapper.isotope_peaks(None, '+H') == emtpy_iso_dict
    assert isocalc_wrapper.isotope_peaks('Au', None) == emtpy_iso_dict

