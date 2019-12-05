from itertools import product
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch, Mock

import numpy as np
import pandas as pd

from sm.engine.formula_centroids import FormulaCentroids
from sm.engine.msm_basic.msm_basic_search import (
    MSMSearch,
    init_fdr,
    collect_ion_formulas,
    compute_fdr,
)
from sm.engine.tests.util import spark_context, ds_config, make_moldb_mock


def make_imzml_parser_mock(sp_n=100):
    imzml_parser_mock = Mock()
    imzml_parser_mock.coordinates = list(product([0], range(sp_n)))
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 100, num=sp_n), np.ones(sp_n))
    imzml_parser_mock.mzPrecision = 'f'
    return imzml_parser_mock


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
    def formula_image_metrics_mock(
        formula_images_it, compute_metrics, target_formula_inds, n_peaks, min_px
    ):
        formula_is = set(item[0] for item in formula_images_it)
        formula_metrics_df = pd.DataFrame(
            [(i, 0.95) for i in formula_is], columns=['formula_i', 'msm']
        ).set_index('formula_i')
        formula_images = dict((i, np.zeros((1, 1))) for i in formula_is)
        return formula_metrics_df, formula_images

    return formula_image_metrics_mock


def test_compute_fdr(spark_context, ds_config):
    moldb_fdr_list = init_fdr(ds_config, [make_moldb_mock()])
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


@patch('sm.engine.msm_basic.formula_imager.formula_image_metrics')
def test_search(formula_image_metrics_mock, spark_context, ds_config):
    with TemporaryDirectory() as tmpdir:
        ds_data_path = Path(tmpdir)
        print(ds_data_path)
        msm_search = MSMSearch(
            spark_context, make_imzml_parser_mock(), [make_moldb_mock()], ds_config, ds_data_path
        )
        formulas_df = pd.DataFrame(
            [(0, 'H3O'), (1, 'C5H4O')], columns=['formula_i', 'formula']
        ).set_index('formula_i')
        centroids_df = (
            pd.DataFrame(
                data=[(0, 0, 1, 100), (0, 1, 2, 10), (1, 0, 2, 100), (1, 1, 3, 100)],
                columns=['formula_i', 'peak_i', 'mz', 'int'],
            )
            .sort_values(by='mz')
            .set_index('formula_i')
        )
        msm_search._fetch_formula_centroids = lambda args: FormulaCentroids(
            formulas_df, centroids_df
        )

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


@patch('sm.engine.msm_basic.formula_imager.formula_image_metrics')
def test_ambiguous_modifiers(formula_image_metrics_mock, spark_context, ds_config):
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

        formulas = [
            'H3O',
            'H4O',
            'H5O2',
            'H6O2',
        ]  # Formulae selected to create isobars with the above modifiers
        msm_search = MSMSearch(
            spark_context,
            make_imzml_parser_mock(),
            [make_moldb_mock(formulas)],
            ds_config,
            ds_data_path,
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
