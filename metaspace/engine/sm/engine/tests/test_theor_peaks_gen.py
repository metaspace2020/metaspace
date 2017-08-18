import numpy as np
import pytest
from unittest.mock import patch, MagicMock
from numpy.testing import assert_array_almost_equal
from pyMSpec.mass_spectrum import MassSpectrum

from sm.engine.theor_peaks_gen import TheorPeaksGenerator, IsocalcWrapper
from sm.engine.isocalc_wrapper import Centroids
from sm.engine.tests.util import spark_context, sm_config, ds_config

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
    sf_adduct_cand = peaks_gen.find_sf_adduct_cand(['He', 'Au'], {('He', '+H'), ('Au', '+H')})

    assert set(sf_adduct_cand) == {('He', '+Na'), ('Au', '+Na')}
