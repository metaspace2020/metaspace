import pandas as pd

from sm.engine.msm_basic.msm_basic_search import init_fdr, collect_ion_formulas, compute_fdr
from sm.engine.tests.util import make_moldb_mock


BASIC_ISOTOPE_GENERATION_CONFIG = {
    "adducts": ["+H"],
    "charge": 1,
    "isocalc_sigma": 0.000619,
    "n_peaks": 4,
    "neutral_losses": [],
    "chem_mods": [],
}

FULL_ISOTOPE_GENERATION_CONFIG = {
    **BASIC_ISOTOPE_GENERATION_CONFIG,
    "adducts": ["", "+H", "+Na", "+K"],
    # Neutral losses / chem mods chosen so that
    "neutral_losses": ["-H", "-O"],
    "chem_mods": ["-H+O"]
}

def test_init_fdr():
    moldb_fdr_list = init_fdr({'decoy_sample_size': 20}, BASIC_ISOTOPE_GENERATION_CONFIG, [make_moldb_mock()])

    assert len(moldb_fdr_list) == 1
    _, fdr = moldb_fdr_list[0]
    assert not fdr.td_df.empty


def test_collect_ion_formulas():
    moldb_fdr_list = init_fdr({'decoy_sample_size': 20}, BASIC_ISOTOPE_GENERATION_CONFIG, [make_moldb_mock()])

    df = collect_ion_formulas(moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    assert df.shape == (42, 4)


def test_decoy_sample_size_30():
    moldb_fdr_list = init_fdr({'decoy_sample_size': 30}, BASIC_ISOTOPE_GENERATION_CONFIG, [make_moldb_mock()])

    df = collect_ion_formulas(moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    assert df.shape == (62, 4)


def test_neutral_losses_and_chem_mods():
    moldb_fdr_list = init_fdr({'decoy_sample_size': 1}, FULL_ISOTOPE_GENERATION_CONFIG, [make_moldb_mock()])

    df = collect_ion_formulas(moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    # 2 formulas * (4 target adducts + (4 target adducts * 1 decoy adducts per target adduct)
    # * (no loss + 2 neutral losses) * (no mod + 1 chem mod) = 2 * (4 + 4) * 3 * 2 = 96
    assert df.shape == (96, 4)