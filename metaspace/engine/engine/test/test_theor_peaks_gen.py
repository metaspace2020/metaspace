from mock import mock, MagicMock
from numpy.testing import assert_array_almost_equal
import numpy as np
from engine.pyMS.mass_spectrum import MassSpectrum
from engine.theor_peaks_gen import TheorPeaksGenerator, IsocalcWrapper
from engine.test.util import spark_context, sm_config, ds_config


def get_spectrum_side_effect(source):
    if source == 'centroids':
        return np.array([100., 200.]), np.array([100., 10.])
    elif source == 'profile':
        return (np.array([0, 90., 95., 99., 100., 101., 105., 110.,
                          190., 195., 199., 200., 201., 205., 210., 100500.]),
                np.array([0, 10., 50., 90., 100., 90., 50., 10.,
                          1., 5., 9., 10., 9., 5., 1., 100500.]))


@mock.patch('engine.theor_peaks_gen.complete_isodist')
def test_isocalc_get_iso_peaks_correct_sf_adduct(isocalc_isodist, ds_config):
    mock_mass_sp = MagicMock(spec=MassSpectrum)
    mock_mass_sp.get_spectrum.side_effect = get_spectrum_side_effect
    isocalc_isodist.return_value = mock_mass_sp

    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    peak_dict = isocalc_wrapper.iso_peaks('Au', '+H')

    # assert sf_id == 9
    # assert adduct == '+H'

    for k in ['centr_mzs', 'centr_ints', 'profile_mzs', 'profile_ints']:
        assert k in peak_dict
        assert len(peak_dict[k]) > 0

    assert_array_almost_equal(peak_dict['centr_mzs'], get_spectrum_side_effect('centroids')[0])
    assert_array_almost_equal(peak_dict['centr_ints'], get_spectrum_side_effect('centroids')[1])

    assert_array_almost_equal(peak_dict['profile_mzs'], get_spectrum_side_effect('profile')[0][1:-1])
    assert_array_almost_equal(peak_dict['profile_ints'], get_spectrum_side_effect('profile')[1][1:-1])


@mock.patch('engine.theor_peaks_gen.complete_isodist')
def test_isocalc_get_iso_peaks_wrong_sf_adduct(isocalc_isodist, ds_config):
    mock_mass_sp = MagicMock(spec=MassSpectrum)
    mock_mass_sp.get_spectrum.side_effect = get_spectrum_side_effect
    isocalc_isodist.return_value = mock_mass_sp

    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    emtpy_iso_dict = {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}
    assert isocalc_wrapper.iso_peaks(None, '+H') == emtpy_iso_dict
    assert isocalc_wrapper.iso_peaks('Au', None) == emtpy_iso_dict


def test_format_peak_str_correct():
    peak_dict = {'centr_mzs': [100.], 'centr_ints': [1000.],
                 'profile_mzs': [90., 100., 110.], 'profile_ints': [1., 1000., 1001.]}

    assert ('0\t9\t+H\t{100.000000}\t{1000.000000}\t'
            '{90.000000,100.000000,110.000000}\t'
            '{1.000000,1000.000000,1001.000000}') == IsocalcWrapper.format_peak_str(0, 9, '+H', peak_dict)


@mock.patch('engine.theor_peaks_gen.DB')
def test_find_sf_adduct_cand(MockDB, spark_context, sm_config, ds_config):
    mock_db = MockDB.return_value
    mock_db.select_one.return_value = [0]
    mock_db.select.return_value = [(0, 'He'), (9, 'Au')]

    peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    stored_sf_adduct = {('He', '+H'), ('Au', '+H')}
    sf_adduct_cand = peaks_gen.find_sf_adduct_cand(stored_sf_adduct)

    assert sf_adduct_cand == [(0, 'He', '+Na'), (9, 'Au', '+Na')]


def get_iso_peaks_side_effect():
    return [(0, '+H', {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}),
            (9, '+H', {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []})]


@mock.patch('engine.theor_peaks_gen.DB')
def test_generate_theor_peaks(mockDB, spark_context, sm_config, ds_config):
    mock_db = mockDB.return_value
    mock_db.select_one.return_value = [0]

    peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    peaks_gen.isocalc_wrapper.iso_peaks = lambda *args: {'centr_mzs': [100.],
                                                         'centr_ints': [1000.],
                                                         'profile_mzs': [90., 100., 110.],
                                                         'profile_ints': [1., 1000., 1001.]}

    sf_adduct_cand = [(9, 'Au', '+Na')]
    peak_lines = peaks_gen.generate_theor_peaks(sf_adduct_cand)

    assert len(peak_lines) == 1
    assert peak_lines[0] == ('0\t9\t+Na\t{100.000000}\t{1000.000000}\t'
                             '{90.000000,100.000000,110.000000}\t'
                             '{1.000000,1000.000000,1001.000000}')
