import numpy as np
from mock import patch, MagicMock
from pyMSpec.mass_spectrum import MassSpectrum

from sm.engine.isocalc_wrapper import IsocalcWrapper
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
    emtpy_iso_dict = {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}
    assert isocalc_wrapper.isotope_peaks(None, '+H') == emtpy_iso_dict
    assert isocalc_wrapper.isotope_peaks('Au', None) == emtpy_iso_dict


@patch('sm.engine.isocalc_wrapper.complete_isodist')
def test_isocalc_wrapper_get_iso_peaks_check_profiles_correct(isocalc_isodist, ds_config):

    def get_spectrum_side_effect(source):
        if source == 'centroids':
            return (np.array([100., 200.]),
                    np.array([100., 10.]))
        elif source == 'profile':
            return (np.hstack([np.linspace(50, 150, 10000), np.linspace(150, 250, 10000)]),
                    np.hstack([np.ones(10000) * 100, np.ones(10000) * 10]))

    mock_mass_sp = MagicMock(spec=MassSpectrum)
    mock_mass_sp.get_spectrum.side_effect = get_spectrum_side_effect
    isocalc_isodist.return_value = mock_mass_sp

    pts_per_centr = 6
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    isocalc_wrapper.prof_pts_per_centr = pts_per_centr
    peaks_dict = isocalc_wrapper.isotope_peaks('Au', '+H')

    # print peaks_dict['centr_mzs'], peaks_dict['centr_ints']
    # print len(peaks_dict['profile_mzs']), len(peaks_dict['profile_ints'])
    print '\n', peaks_dict

    # profiles not huge in size
    assert len(peaks_dict['profile_mzs']) <= (pts_per_centr + 1) * len(peaks_dict['centr_mzs'])
    assert len(peaks_dict['profile_ints']) <= (pts_per_centr + 1) * len(peaks_dict['centr_ints'])

    # profile points not too far or close to the centroids
    assert 0.1 < abs(peaks_dict['centr_mzs'][0] - peaks_dict['profile_mzs'][0]) < 0.2
    assert 0.1 < abs(peaks_dict['centr_mzs'][0] - peaks_dict['profile_mzs'][pts_per_centr - 1]) < 0.2

    assert 0.1 < abs(peaks_dict['centr_mzs'][1] - peaks_dict['profile_mzs'][pts_per_centr]) < 0.2
    assert 0.1 < abs(peaks_dict['centr_mzs'][1] - peaks_dict['profile_mzs'][2 * pts_per_centr - 1]) < 0.2
