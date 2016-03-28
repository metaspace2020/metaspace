from mock import MagicMock, patch
import pytest
import pandas as pd
import numpy as np
from numpy.testing import assert_array_almost_equal

from engine.db import DB
from engine.fdr import FDR
from engine.test.util import assert_df_equal


@patch('engine.fdr.DECOY_ADDUCTS', ['+He', '+Li'])
def test_fdr_decoy_adduct_selection_saves_corr():
    db_mock = MagicMock(DB)
    db_mock.select.return_value = [(1,)]

    fdr = FDR(0, 0, 2, ['+H', '+K'], db_mock)

    def assert_df_values_equal(self, other):
        assert set(self) == set(other)

    exp_target_decoy_df = pd.DataFrame([(1, '+H', '+He'),
                                        (1, '+H', '+Li'),
                                        (1, '+K', '+He'),
                                        (1, '+K', '+Li')],
                                       columns=['sf_id', 'ta', 'da'])
    fdr._save_target_decoy_df = MagicMock(side_effect=lambda: assert_df_values_equal(exp_target_decoy_df, fdr.td_df))

    fdr.decoy_adduct_selection()


def test_estimate_fdr_returns_correct_df():
    fdr = FDR(0, 0, 2, ['+H'], None)
    fdr.td_df = pd.DataFrame([[1, '+H', '+Cu'],
                              [1, '+H', '+Co'],
                              [2, '+H', '+Ag'],
                              [2, '+H', '+Ar']],
                             columns=['sf_id', 'ta', 'da'])

    sf_df = pd.DataFrame([[1, '+H', 0.85],
                          [2, '+H', 0.5],
                          [1, '+Cu', 0.5],
                          [1, '+Co', 0.5],
                          [2, '+Ag', 0.75],
                          [2, '+Ar', 0.0]],
                         columns=['sf_id', 'adduct', 'msm'])
    exp_sf_df = pd.DataFrame([[1, '+H', 0], [2, '+H', 0.75]],
                             columns=['sf_id', 'adduct', 'fdr'])

    assert_df_equal(fdr.estimate_fdr(sf_df), exp_sf_df)
