import pandas as pd

from sm.engine.msm_basic.msm_basic_search import init_fdr, collect_ion_formulas, compute_fdr
from sm.engine.tests.util import make_moldb_mock


def test_init_fdr():
    moldb_fdr_list = init_fdr([make_moldb_mock()], ['+H'])

    assert len(moldb_fdr_list) == 1
    _, fdr = moldb_fdr_list[0]
    assert not fdr.td_df.empty


def test_collect_ion_formulas():
    moldb_fdr_list = init_fdr([make_moldb_mock()], ['+H'])

    df = collect_ion_formulas(moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'adduct']
    assert df.shape == (42, 4)
