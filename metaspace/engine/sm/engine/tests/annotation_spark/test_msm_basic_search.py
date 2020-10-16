from unittest.mock import patch

from sm.engine.ds_config import DSConfigIsotopeGeneration
from sm.engine.molecular_db import MolecularDB
from sm.engine.annotation_spark.msm_basic_search import init_fdr, collect_ion_formulas
from tests.conftest import spark_context

BASIC_ISOTOPE_GENERATION_CONFIG: DSConfigIsotopeGeneration = {
    "instrument": "Orbitrap",
    "adducts": ["+H"],
    "charge": 1,
    "isocalc_sigma": 0.000619,
    "n_peaks": 4,
    "neutral_losses": [],
    "chem_mods": [],
}

FULL_ISOTOPE_GENERATION_CONFIG: DSConfigIsotopeGeneration = {
    **BASIC_ISOTOPE_GENERATION_CONFIG,  # type: ignore # https://github.com/python/mypy/issues/9408
    "adducts": ["", "+H", "+Na", "+K"],
    # Neutral losses / chem mods chosen so that
    "neutral_losses": ["-H", "-O"],
    "chem_mods": ["-H+O"],
}


@patch(
    'sm.engine.annotation_spark.msm_basic_search.molecular_db.fetch_formulas',
    return_value=['H2O', 'C5H3O'],
)
class TestMsmBasicSearch:
    def test_init_fdr(self, fetch_formulas_mock):
        ds_config = {
            'analysis_version': 1,
            'fdr': {'decoy_sample_size': 20},
            'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
        }
        moldb_fdr_list = init_fdr(ds_config, [MolecularDB(0, 'test_db', 'version')])

        assert len(moldb_fdr_list) == 1
        _, fdr = moldb_fdr_list[0]
        assert not fdr.td_df.empty

    def test_collect_ion_formulas(self, fetch_formulas_mock, spark_context):
        ds_config = {
            'analysis_version': 1,
            'fdr': {'decoy_sample_size': 20},
            'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
        }
        moldb_fdr_list = init_fdr(ds_config, [MolecularDB(0, 'test_db', 'version')])

        df = collect_ion_formulas(spark_context, moldb_fdr_list)

        assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
        assert df.shape == (42, 4)

    def test_decoy_sample_size_30(self, fetch_formulas_mock, spark_context):
        ds_config = {
            'analysis_version': 1,
            'fdr': {'decoy_sample_size': 30},
            'isotope_generation': BASIC_ISOTOPE_GENERATION_CONFIG,
        }
        moldb_fdr_list = init_fdr(ds_config, [MolecularDB(0, 'test_db', 'version')])

        df = collect_ion_formulas(spark_context, moldb_fdr_list)

        assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
        assert df.shape == (62, 4)

    def test_neutral_losses_and_chem_mods(self, fetch_formulas_mock, spark_context):
        ds_config = {
            'analysis_version': 1,
            'fdr': {'decoy_sample_size': 1},
            'isotope_generation': FULL_ISOTOPE_GENERATION_CONFIG,
        }
        moldb_fdr_list = init_fdr(ds_config, [MolecularDB(0, 'test_db', 'version')])

        df = collect_ion_formulas(spark_context, moldb_fdr_list)

        assert df.columns.tolist() == ['moldb_id', 'ion_formula', 'formula', 'modifier']
        # 2 formulas * (4 target adducts + (4 target adducts * 1 decoy adducts per target adduct)
        # * (no loss + 2 neutral losses) * (no mod + 1 chem mod) = 2 * (4 + 4) * 3 * 2 = 96
        assert df.shape == (96, 4)
