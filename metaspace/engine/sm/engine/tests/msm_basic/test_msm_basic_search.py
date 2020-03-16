from sm.engine.msm_basic.msm_basic_search import init_fdr, collect_ion_formulas
from tests.conftest import spark_context, make_moldb_mock

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
    "chem_mods": ["-H+O"],
}


def test_init_fdr():
    ds_config = {
        'analysis_version': 1,
        'fdr': {'decoy_sample_size': 20},
        'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
    }
    moldb_fdr_list = init_fdr(ds_config, [make_moldb_mock()])

    assert len(moldb_fdr_list) == 1
    _, fdr = moldb_fdr_list[0]
    assert not fdr.td_df.empty


def test_collect_ion_formulas(spark_context):
    ds_config = {
        'analysis_version': 1,
        'fdr': {'decoy_sample_size': 20},
        'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
    }
    moldb_fdr_list = init_fdr(ds_config, [make_moldb_mock()])

    df = collect_ion_formulas(spark_context, moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    assert df.shape == (42, 4)


def test_decoy_sample_size_30(spark_context):
    ds_config = {
        'analysis_version': 1,
        'fdr': {'decoy_sample_size': 30},
        'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
    }
    moldb_fdr_list = init_fdr(ds_config, [make_moldb_mock()])

    df = collect_ion_formulas(spark_context, moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    assert df.shape == (62, 4)


def test_neutral_losses_and_chem_mods(spark_context):
    ds_config = {
        'analysis_version': 1,
        'fdr': {'decoy_sample_size': 1},
        'isotope_generation': FULL_ISOTOPE_GENERATION_CONFIG,
    }
    moldb_fdr_list = init_fdr(ds_config, [make_moldb_mock()])

    df = collect_ion_formulas(spark_context, moldb_fdr_list)

    assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
    # 2 formulas * (4 target adducts + (4 target adducts * 1 decoy adducts per target adduct)
    # * (no loss + 2 neutral losses) * (no mod + 1 chem mod) = 2 * (4 + 4) * 3 * 2 = 96
    assert df.shape == (96, 4)
