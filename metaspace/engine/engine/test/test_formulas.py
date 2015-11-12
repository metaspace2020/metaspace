from mock import patch, mock_open, mock, Mock, MagicMock
from numpy.testing import assert_array_almost_equal
import pytest
from collections import defaultdict

from engine.formulas import Formulas
from engine.db import DB


@pytest.fixture
def formulas():
    db_mock = MagicMock(spec=DB)
    db_mock.select.return_value = [([100, 200], [100, 10])]

    ds_config = defaultdict(dict)
    ds_config['image_generation']['ppm'] = 1.0
    ds_config['inputs']['database'] = 'HMDB'
    ds_config['isotope_generation']['adducts'] = ["H", "Na", "K"]

    return Formulas(ds_config, db_mock)


def test_get_sf_bounds(formulas):
    assert_array_almost_equal(formulas.get_sf_peak_bounds(),
                              [[100 - 100*1e-6, 200 - 200*1e-6], [100 + 100*1e-6, 200 + 200*1e-6]])


def test_get_sf_peak_map(formulas):
    assert_array_almost_equal(formulas.get_sf_peak_map(),
                              [[0, 0], [0, 1]])


def test_get_sf_peak_ints(formulas):
    assert_array_almost_equal(formulas.get_sf_peak_ints(),
                              [[100, 10]])


def test_get_sf_peaks(formulas):
    assert_array_almost_equal(formulas.get_sf_peaks(),
                              [[100, 200]])
