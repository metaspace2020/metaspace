import numpy as np
import pytest
from mock import patch, MagicMock
from numpy.testing import assert_array_almost_equal
from pyMSpec.mass_spectrum import MassSpectrum

from sm.engine.theor_peaks_gen import TheorPeaksGenerator, IsocalcWrapper
from sm.engine.isocalc_wrapper import Centroids
from sm.engine.tests.util import spark_context, sm_config, ds_config


def get_spectrum_side_effect(source):
    if source == 'centroids':
        return np.array([100., 200.]), np.array([100., 10.])


@patch('sm.engine.isocalc_wrapper.complete_isodist')
def test_isocalc_get_iso_peaks_correct_sf_adduct(isocalc_isodist, ds_config):
    mock_mass_sp = MagicMock(spec=MassSpectrum)
    mock_mass_sp.get_spectrum.side_effect = get_spectrum_side_effect
    isocalc_isodist.return_value = mock_mass_sp

    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    centroids = isocalc_wrapper.isotope_peaks('Au', '+H')

    assert_array_almost_equal(centroids.mzs, np.array([100., 200.]))
    assert_array_almost_equal(centroids.ints, np.array([100., 10.]))


@patch('sm.engine.theor_peaks_gen.IsocalcWrapper.isotope_peaks')
def test_formatted_iso_peaks_correct_input(iso_peaks_mock, ds_config):
    iso_peaks_mock.return_value = Centroids([100.], [1000.])

    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])

    assert list(isocalc_wrapper.formatted_iso_peaks(0, 9, 'Au', '+H'))[0] == \
           '0\t9\t+H\t0.010000\t1\t10000\t{100.000000}\t{1000.000000}\t{}\t{}'


@patch('sm.engine.theor_peaks_gen.DB')
def test_raises_exc_on_empty_formula_table(MockDB, ds_config):
    with pytest.raises(AssertionError):
        mock_db = MockDB.return_value
        mock_db.select.return_value = []

        gen = TheorPeaksGenerator(None, {'db': {}, 'fs': {'base_path': ''}}, ds_config)
        gen.find_sf_adduct_cand([], {})


@patch('sm.engine.theor_peaks_gen.DB')
@patch('sm.engine.theor_peaks_gen.DECOY_ADDUCTS')
def test_find_sf_adduct_cand(DECOY_ADDUCTS_mock, MockDB, spark_context, sm_config, ds_config):
    DECOY_ADDUCTS_mock = []

    peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    sf_adduct_cand = peaks_gen.find_sf_adduct_cand([(0, 'He'), (9, 'Au')], {('He', '+H'), ('Au', '+H')})

    assert sf_adduct_cand == [(0, 'He', '+Na'), (9, 'Au', '+Na')]


@patch('sm.engine.theor_peaks_gen.DB')
def test_apply_database_filters_organic_filter(MockDB, spark_context, sm_config, ds_config):
    ds_config['isotope_generation']['adducts'] = ['+H']
    ds_config['database']['filters'] = ["Organic"]

    peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    sf_adduct_cand = peaks_gen.apply_database_filters([(0, 'He'), (9, 'CO2')])

    assert sf_adduct_cand == [(9, 'CO2')]


@patch('sm.engine.theor_peaks_gen.DB')
@patch('sm.engine.theor_peaks_gen.TheorPeaksGenerator._import_theor_peaks_to_db')
def test_generate_theor_peaks(mock_import_theor_peaks_to_db, mockDB, spark_context, sm_config, ds_config):
    mock_db = mockDB.return_value
    mock_db.select_one.return_value = [0]

    peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    peaks_gen.isocalc_wrapper.isotope_peaks = lambda *args: Centroids([100.], [1000.])

    sf_adduct_cand = [(9, 'Au', '+Na')]
    peaks_gen.generate_theor_peaks(sf_adduct_cand)

    mock_import_theor_peaks_to_db.assert_called_with([('0\t9\t+Na\t0.010000\t1\t10000\t'
                                                       '{100.000000}\t{1000.000000}\t'
                                                       '{}\t'
                                                       '{}')])
