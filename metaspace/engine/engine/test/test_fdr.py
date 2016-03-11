from mock import MagicMock, patch
import pytest
import pandas as pd

from engine.db import DB
from engine.fdr import FDR


def assert_df_equal(self, other):
    assert set(self) == set(other)


@patch('engine.fdr.DECOY_ADDUCTS', ['+He', '+Li'])
def test_fdr_decoy_adduct_selection_saves_corr():
    db_mock = MagicMock(DB)
    db_mock.select.return_value = [(1,)]

    ds_config = {'isotope_generation': {'adducts': ['+H', '+K']}}
    fdr = FDR(0, 0, ds_config, db_mock)

    exp_target_decoy_df = pd.DataFrame([(0, 0, 1, '+H', '+He'),
                                        (0, 0, 1, '+H', '+Li'),
                                        (0, 0, 1, '+K', '+He'),
                                        (0, 0, 1, '+K', '+Li')],
                                       columns=['job_id', 'db_id', 'sf_id', 'ta', 'da'])
    fdr.save_target_decoy_df = MagicMock(side_effect=lambda df: assert_df_equal(exp_target_decoy_df, df))

    fdr.decoy_adduct_selection(n=2)
