from mock import MagicMock
from numpy.testing import assert_array_equal, assert_array_almost_equal
import pytest
from collections import defaultdict

from engine.formulas import Formulas
from engine.db import DB
from engine.test.util import ds_config


# @pytest.fixture()
# def ds_config():
#     ds_config = defaultdict(dict)
#     ds_config['image_generation']['ppm'] = 1.0
#     ds_config['inputs']['database'] = 'HMDB'
#     ds_config['isotope_generation']['adducts'] = ["H", "Na", "K"]


@pytest.fixture
def formulas(ds_config):
    db_mock = MagicMock(spec=DB)
    db_mock.select.return_value = [(1, '+H', [100, 200], [100, 10])]

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


def test_get_sf_adduct_peaksn(formulas):
    assert_array_equal(formulas.get_sf_adduct_peaksn(), [(1, '+H', 2)])


def test_raisases_exc_on_duplicate_formula_ids(ds_config):
    with pytest.raises(AssertionError):
        db_mock = MagicMock(spec=DB)
        db_mock.select.return_value = [(1, '+H', [100, 200], [100, 10]),
                                       (1, '+H', [10, 20], [10, 1])]
        Formulas(ds_config, db_mock)
