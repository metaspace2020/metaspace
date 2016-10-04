from mock import patch, MagicMock

from sm.engine.isocalc_wrapper import IsocalcWrapper, Centroids
from sm.engine.tests.util import ds_config

def test_isocalc_wrapper_get_iso_peaks_wrong_sf_adduct(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config['isotope_generation'])
    assert isocalc_wrapper.isotope_peaks(None, '+H').empty
    assert isocalc_wrapper.isotope_peaks('Au', None).empty
