import pytest
from unittest.mock import MagicMock
from numpy.testing import assert_array_equal, assert_array_almost_equal

from sm.engine.db import DB

from sm.engine.tests.util import ds_config


# @pytest.fixture
# def formulas(ds_config):
#     returns = [[(1, '+H', [100], [100])],
#                [(2, '+Au', [1000], [100])]]
#
#     def sel_theor_peaks(*args):
#         return returns.pop(0)
#
#     db_mock = MagicMock(spec=DB)
#     db_mock.select.side_effect = sel_theor_peaks
#
#     return Formulas(0, 0, ds_config, db_mock)
#
#
# def test_get_sf_bounds(formulas):
#     assert_array_almost_equal(formulas.get_sf_peak_bounds(),
#                               ([100 - 100*1e-6, 1000 - 1000*1e-6],
#                                [100 + 100*1e-6, 1000 + 1000*1e-6]))
#
#
# def test_get_sf_peak_map(formulas):
#     assert_array_almost_equal(formulas.get_sf_peak_map(),
#                               [[0, 0], [1, 0]])
#
#
# def test_get_sf_peak_ints(formulas):
#     assert_array_almost_equal(formulas.get_sf_peak_ints(),
#                               [[100], [100]])
#
#
# def test_get_sf_peaks(formulas):
#     assert_array_almost_equal(formulas.get_sf_peaks(),
#                               [[100], [1000]])
#
#
# def test_get_sf_adduct_peaksn(formulas):
#     assert_array_equal(formulas.get_sf_adduct_peaksn(), [(1, '+H', 1), (2, '+Au', 1)])
#
#
# def test_raises_exc_on_duplicate_formula_ids(ds_config):
#     with pytest.raises(AssertionError):
#         db_mock = MagicMock(spec=DB)
#         db_mock.select.return_value = [(1, '+H', [100, 200], [100, 10]),
#                                        (1, '+H', [10, 20], [10, 1])]
#         Formulas(0, 0, ds_config, db_mock)
#
#
# def test_raises_exc_on_empty_data_table(ds_config):
#     with pytest.raises(AssertionError):
#         db_mock = MagicMock(spec=DB)
#         db_mock.select.return_value = []
#
#         Formulas(0, 0, ds_config, db_mock)