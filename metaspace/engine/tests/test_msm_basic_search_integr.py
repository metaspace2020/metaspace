from pathlib import Path
from tempfile import TemporaryDirectory
import pytest
from unittest.mock import patch, MagicMock

import numpy as np
import pandas as pd

from sm.engine.annotation.fdr import FDR
from sm.engine.annotation.formula_centroids import FormulaCentroids
from sm.engine.molecular_db import MolecularDB
from sm.engine.annotation_spark.msm_basic_search import (
    MSMSearch,
    init_fdr,
    collect_ion_formulas,
    compute_fdr,
    compute_fdr_and_filter_results,
)
from sm.engine.utils.perf_profile import NullProfiler
from tests.conftest import make_imzml_reader_mock


def make_fetch_formula_centroids_mock():
    def fetch_formula_centroids_mock(ion_formula_map_df):
        formulas_df = (
            pd.DataFrame(
                {'formula_i': ion_formula_map_df.index, 'formula': ion_formula_map_df.ion_formula}
            )
            .set_index('formula_i')
            .drop_duplicates()
        )
        centroids_df = (
            pd.DataFrame(
                data=[
                    (formula_i, peak_i, formula_i + peak_i, 100 - min(99, formula_i * peak_i))
                    for formula_i in formulas_df.index.drop_duplicates()
                    for peak_i in range(2)
                ],
                columns=['formula_i', 'peak_i', 'mz', 'int'],
            )
            .sort_values(by='mz')
            .set_index('formula_i')
        )
        return FormulaCentroids(formulas_df, centroids_df)

    return fetch_formula_centroids_mock


def make_formula_image_metrics_mock_side_effect():
    def formula_image_metrics_mock(formula_images_it, *args, **kwargs):
        formula_is = set(item[0] for item in formula_images_it)
        formula_metrics_df = pd.DataFrame(
            [(i, 0.95) for i in formula_is], columns=['formula_i', 'msm']
        ).set_index('formula_i')
        formula_images = dict((i, np.zeros((1, 1))) for i in formula_is)
        return formula_metrics_df, formula_images

    return formula_image_metrics_mock


@patch('sm.engine.molecular_db.fetch_formulas', lambda moldb_id: ['H2O', 'C5H3O'])
def test_compute_fdr(spark_context, ds_config):
    moldb_fdr_list = init_fdr(ds_config, [MolecularDB(0, 'test_db', 'version')])
    _, fdr = moldb_fdr_list[0]
    formula_map_df = collect_ion_formulas(spark_context, moldb_fdr_list).drop('moldb_id', axis=1)

    formula_metrics_df = pd.DataFrame(
        [(10, 'H3O', 0.99), (11, 'C5H4O', 0.5), (12, 'H2ONa', 0.1)],
        columns=['formula_i', 'ion_formula', 'msm'],
    ).set_index('formula_i')

    metrics_df = compute_fdr(fdr, formula_metrics_df, formula_map_df)

    assert len(metrics_df) == 3
    assert sorted(metrics_df.columns.tolist()) == sorted(
        ['ion_formula', 'msm', 'formula', 'modifier', 'fdr']
    )


def make_search_results(spark_context):
    fdr_mock = MagicMock(FDR)
    fdr_mock.estimate_fdr.side_effect = lambda df: df.assign(fdr=[0.5, 1.0])
    fdr_mock.target_modifiers_df = pd.DataFrame(
        {'target_modifier': ['+H'], 'adduct': ['+H']}
    ).set_index('target_modifier')
    ion_formula_map_df = pd.DataFrame(
        {
            'moldb_id': [0, 0],
            'ion_formula': ['H30', 'C2H70'],
            'formula': ['H20', 'C2H60'],
            'modifier': ['+H', '+H'],
        }
    )
    formula_metrics_df = pd.DataFrame(
        {'formula_i': [0, 1], 'msm': [0.9, 0.95], 'ion_formula': ['H30', 'C2H70']}
    ).set_index('formula_i')
    formula_images_rdd = spark_context.parallelize([(0, np.array([[0.0]])), (1, np.array([[0.0]]))])
    return fdr_mock, ion_formula_map_df, formula_metrics_df, formula_images_rdd


@pytest.mark.parametrize("targeted,exp_annot_n", [(False, 1), (True, 2)])
def test_compute_fdr_and_filter_results(targeted, exp_annot_n, spark_context):
    moldb = MolecularDB(0, 'test_db', 'version', targeted=targeted)
    fdr, ion_formula_map_df, formula_metrics_df, formula_images_rdd = make_search_results(
        spark_context
    )

    moldb_ion_metrics_df, moldb_ion_images_rdd = compute_fdr_and_filter_results(
        moldb, fdr, ion_formula_map_df, formula_metrics_df, formula_images_rdd
    )

    assert moldb_ion_metrics_df.shape[0] == exp_annot_n
    assert moldb_ion_images_rdd.count() == exp_annot_n


@patch('sm.engine.annotation_spark.formula_imager.formula_image_metrics')
@patch('sm.engine.molecular_db.fetch_formulas', lambda moldb_id: ['H2O', 'C5H3O'])
def test_search(formula_image_metrics_mock, spark_context, ds_config):
    with TemporaryDirectory() as tmpdir:
        ds_data_path = Path(tmpdir)
        print(ds_data_path)
        msm_search = MSMSearch(
            spark_context,
            make_imzml_reader_mock(),
            [MolecularDB(0, 'tests_db', 'version')],
            ds_config,
            ds_data_path,
            NullProfiler(),
        )
        msm_search._fetch_formula_centroids = make_fetch_formula_centroids_mock()

        msm_search.process_segments = lambda centr_segm_n, func: spark_context.parallelize(
            map(func, range(centr_segm_n))
        )

        image_metrics_result_list = [
            (
                pd.DataFrame([(0, 0.95)], columns=['formula_i', 'msm']).set_index('formula_i'),
                {0: np.zeros((1, 1))},
            ),
            (
                pd.DataFrame([(1, 0.9)], columns=['formula_i', 'msm']).set_index('formula_i'),
                {0: np.zeros((1, 1)), 1: np.zeros((1, 1))},
            ),
        ]
        formula_image_metrics_mock.side_effect = image_metrics_result_list

        moldb_ion_metrics_df, moldb_ion_images_rdd = next(msm_search.search())

        assert len(moldb_ion_metrics_df) == 2
        assert moldb_ion_images_rdd.count() == 3


@patch('sm.engine.annotation_spark.formula_imager.formula_image_metrics')
@patch('sm.engine.molecular_db.fetch_formulas')
def test_ambiguous_modifiers(
    fetch_formulas_mock, formula_image_metrics_mock, spark_context, ds_config
):
    with TemporaryDirectory() as tmpdir:
        ds_data_path = Path(tmpdir)
        print(ds_data_path)

        ds_config = {
            **ds_config,
            "isotope_generation": {
                **ds_config["isotope_generation"],
                # This set of modifiers are deliberately chosen so that ('','-H2O','+H') and ('-H2O+H','','') produce the same
                # modifier string, to test that no code accidentally relies on "modifier" or "ion" strings being unambiguous
                "chem_mods": ["-H2O+H"],
                "neutral_losses": ["-H2O"],
                "adducts": ["+H", "[M]+"],
            },
        }

        fetch_formulas_mock.return_value = [
            'H3O',
            'H4O',
            'H5O2',
            'H6O2',
        ]  # Formulae selected to create isobars with the above modifiers
        msm_search = MSMSearch(
            spark_context,
            make_imzml_reader_mock(),
            [MolecularDB(0, 'test_db', 'version')],
            ds_config,
            ds_data_path,
            NullProfiler(),
        )
        msm_search._fetch_formula_centroids = make_fetch_formula_centroids_mock()
        msm_search.process_segments = lambda centr_segm_n, func: spark_context.parallelize(
            map(func, range(centr_segm_n))
        )
        formula_image_metrics_mock.side_effect = make_formula_image_metrics_mock_side_effect()

        moldb_ion_metrics_df, _ = next(msm_search.search())

        assert (
            moldb_ion_metrics_df[['formula', 'chem_mod', 'neutral_loss', 'adduct']]
            .duplicated()
            .sum()
            == 0
        )
        # There are 3 combinations of modifiers to get H2: (H5O2,-H2O+H,-H2O,), (H3O,-H2O+H,,), (H3O,,-H2O,+H)
        assert len(moldb_ion_metrics_df[moldb_ion_metrics_df.ion_formula == 'H2']) == 3
        # Only 1 combination of modifiers can create H7O2: (H6O2,,,+H)
        assert len(moldb_ion_metrics_df[moldb_ion_metrics_df.ion_formula == 'H7O2']) == 1
        # (4 formulas * 4 modifiers that have 0 or 1 "-H2O" component) + (2 formulas * 2 modifiers that have 2 "-H2O" components) = 20 ions
        assert len(moldb_ion_metrics_df) == 20
