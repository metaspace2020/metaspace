from mock import MagicMock, patch
import pytest
import pandas as pd
import numpy as np
from numpy.testing import assert_array_almost_equal
from pandas.util.testing import assert_frame_equal

from engine.db import DB
from engine.fdr import FDR


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
    fdr.fdr_levels = [0.2, 0.8]
    fdr.td_df = pd.DataFrame([[1, '+H', '+Cu'],
                              [1, '+H', '+Co'],
                              [2, '+H', '+Ag'],
                              [2, '+H', '+Ar']],
                             columns=['sf_id', 'ta', 'da'])

    msm_df = pd.DataFrame([[1, '+H', 0.85],
                          [2, '+H', 0.5],
                          [1, '+Cu', 0.5],
                          [1, '+Co', 0.5],
                          [2, '+Ag', 0.75],
                          [2, '+Ar', 0.0]],
                          columns=['sf_id', 'adduct', 'msm']).set_index(['sf_id', 'adduct']).sort_index()
    exp_sf_df = pd.DataFrame([[1, '+H', 0.2], [2, '+H', 0.8]],
                             columns=['sf_id', 'adduct', 'fdr']).set_index(['sf_id', 'adduct'])

    assert_frame_equal(fdr.estimate_fdr(msm_df), exp_sf_df)


def test_estimate_fdr_digitize_works():
    fdr = FDR(0, 0, 1, ['+H'], None)
    fdr.fdr_levels = [0.4, 0.8]
    fdr.td_df = pd.DataFrame([[1, '+H', '+Cu'],
                              [2, '+H', '+Ag'],
                              [3, '+H', '+Cl'],
                              [4, '+H', '+Co']],
                             columns=['sf_id', 'ta', 'da'])

    msm_df = pd.DataFrame([[1, '+H', 1.0],
                          [2, '+H', 0.75],
                          [3, '+H', 0.5],
                          [4, '+H', 0.25],
                          [1, '+Cu', 0.75],
                          [2, '+Ag', 0.3],
                          [3, '+Cl', 0.25],
                          [4, '+Co', 0.1]],
                          columns=['sf_id', 'adduct', 'msm']).set_index(['sf_id', 'adduct']).sort_index()
    exp_sf_df = pd.DataFrame([[1, '+H', 0.4],
                              [2, '+H', 0.4],
                              [3, '+H', 0.4],
                              [4, '+H', 0.8]],
                             columns=['sf_id', 'adduct', 'fdr']).set_index(['sf_id', 'adduct'])

    assert_frame_equal(fdr.estimate_fdr(msm_df), exp_sf_df)
