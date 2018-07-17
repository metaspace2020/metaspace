from itertools import product
from unittest.mock import MagicMock, patch

import pandas as pd
from pandas.util.testing import assert_frame_equal

from sm.engine.db import DB
from sm.engine.fdr import FDR


@patch('sm.engine.fdr.DECOY_ADDUCTS', ['+He', '+Li'])
def test_fdr_decoy_adduct_selection_saves_corr():
    db_mock = MagicMock(DB)
    db_mock.select.return_value = [(1,)]

    fdr = FDR(job_id=0, decoy_sample_size=2, target_adducts=['+H', '+K'], db=db_mock)

    exp_target_decoy_df = pd.DataFrame([('H2O', '+H', '+He'),
                                        ('H2O', '+H', '+Li'),
                                        ('H2O', '+K', '+He'),
                                        ('H2O', '+K', '+Li')],
                                       columns=['sf', 'ta', 'da'])

    fdr.decoy_adducts_selection(target_ions=[('H2O', '+H'), ('H2O', '+K')])

    assert_frame_equal(fdr.td_df.sort_values(by=['sf', 'ta', 'da']).reset_index(drop=True),
                       exp_target_decoy_df.sort_values(by=['sf', 'ta', 'da']).reset_index(drop=True))


def test_estimate_fdr_returns_correct_df():
    fdr = FDR(job_id=0, decoy_sample_size=2, target_adducts=['+H'], db=None)
    fdr.fdr_levels = [0.2, 0.8]
    fdr.td_df = pd.DataFrame([['H2O', '+H', '+Cu'],
                              ['H2O', '+H', '+Co'],
                              ['C2H2', '+H', '+Ag'],
                              ['C2H2', '+H', '+Ar']],
                             columns=['sf', 'ta', 'da'])

    msm_df = pd.DataFrame([['H2O', '+H', 0.85],
                          ['C2H2', '+H', 0.5],
                          ['H2O', '+Cu', 0.5],
                          ['H2O', '+Co', 0.5],
                          ['C2H2', '+Ag', 0.75],
                          ['C2H2', '+Ar', 0.0]],
                          columns=['sf', 'adduct', 'msm']).set_index(['sf', 'adduct']).sort_index()
    exp_sf_df = pd.DataFrame([['H2O', '+H', 0.2], ['C2H2', '+H', 0.8]],
                             columns=['sf', 'adduct', 'fdr']).set_index(['sf', 'adduct'])

    assert_frame_equal(fdr.estimate_fdr(msm_df), exp_sf_df)


def test_estimate_fdr_digitize_works():
    fdr = FDR(job_id=0, decoy_sample_size=1, target_adducts=['+H'], db=None)
    fdr.fdr_levels = [0.4, 0.8]
    fdr.td_df = pd.DataFrame([['C1', '+H', '+Cu'],
                              ['C2', '+H', '+Ag'],
                              ['C3', '+H', '+Cl'],
                              ['C4', '+H', '+Co']],
                             columns=['sf', 'ta', 'da'])

    msm_df = pd.DataFrame([['C1', '+H', 1.0],
                          ['C2', '+H', 0.75],
                          ['C3', '+H', 0.5],
                          ['C4', '+H', 0.25],
                          ['C1', '+Cu', 0.75],
                          ['C2', '+Ag', 0.3],
                          ['C3', '+Cl', 0.25],
                          ['C4', '+Co', 0.1]],
                          columns=['sf', 'adduct', 'msm']).set_index(['sf', 'adduct']).sort_index()
    exp_sf_df = pd.DataFrame([['C1', '+H', 0.4],
                              ['C2', '+H', 0.4],
                              ['C3', '+H', 0.4],
                              ['C4', '+H', 0.8]],
                             columns=['sf', 'adduct', 'fdr']).set_index(['sf', 'adduct'])

    assert_frame_equal(fdr.estimate_fdr(msm_df), exp_sf_df)


def test_ions():
    sfs = ['H2O', 'C5H2OH']
    target_adducts = ['+H', '+Na']
    decoy_sample_size = 5

    fdr = FDR(job_id=0, decoy_sample_size=decoy_sample_size,
              target_adducts=target_adducts, db=None)
    fdr.decoy_adducts_selection(target_ions=[('H2O', '+H'), ('H2O', '+Na'),
                                             ('C5H2OH', '+H'), ('C5H2OH', '+Na')])
    ions = fdr.ion_tuples()

    assert type(ions) == list
    # total number varies because different (sf, adduct) pairs may receive the same (sf, decoy_adduct) pair
    assert len(sfs) * decoy_sample_size + len(sfs) * len(target_adducts) < \
           len(ions) <= \
           len(sfs) * len(target_adducts) * decoy_sample_size + len(sfs) * len(target_adducts)
    target_ions = [(sf, adduct) for sf, adduct in product(sfs, target_adducts)]
    assert set(target_ions).issubset(set(map(tuple, ions)))
