from itertools import product
from pathlib import Path
from shutil import rmtree
from unittest.mock import MagicMock, patch, Mock
import numpy as np
import pandas as pd

from sm.engine.dataset_reader import DatasetReader
from sm.engine.formula_centroids import CentroidsGenerator, FormulaCentroids
from sm.engine.msm_basic.msm_basic_search import MSMSearch, init_fdr, collect_ion_formulas, compute_fdr
from sm.engine.tests.util import pyspark_context, ds_config, make_moldb_mock


def test_compute_fdr():
    moldb_fdr_list = init_fdr([make_moldb_mock()], ['+H', '+Na'])
    _, fdr = moldb_fdr_list[0]
    formula_map_df = collect_ion_formulas(moldb_fdr_list).drop('moldb_id', axis=1)

    formula_metrics_df = (pd.DataFrame([(10, 'H3O', 0.99),
                                        (11, 'C5H4O', 0.5),
                                        (12, 'H2ONa', 0.0)],
                                       columns=['formula_i', 'ion_formula', 'msm'])
                          .set_index('formula_i'))

    metrics_df = compute_fdr(fdr, formula_metrics_df, formula_map_df)

    assert metrics_df.shape == (2, 5)
    assert sorted(metrics_df.columns.tolist()) == sorted(['ion_formula', 'msm', 'formula', 'adduct', 'fdr'])


@patch('sm.engine.msm_basic.formula_imager.formula_image_metrics')
def test_search(formula_image_metrics_mock, pyspark_context, ds_config):
    sp_n = 100
    imzml_parser_mock = Mock()
    imzml_parser_mock.coordinates = list(product([0], range(sp_n)))
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 100, num=sp_n), np.ones(sp_n))

    ds_data_path = Path('/tmp/abc')
    msm_search = MSMSearch(pyspark_context, imzml_parser_mock, [make_moldb_mock()], ds_config, ds_data_path)
    formulas_df = (pd.DataFrame([(0, 'H3O'), (1, 'C5H4O')], columns=['formula_i', 'formula'])
                   .set_index('formula_i'))
    centroids_df = (pd.DataFrame(data=[(0, 0, 1, 100), (0, 1, 2, 10),
                                       (1, 0, 2, 100), (1, 1, 3, 100)],
                                 columns=['formula_i', 'peak_i', 'mz', 'int'])
                    .sort_values(by='mz')
                    .set_index('formula_i'))
    msm_search._fetch_formula_centroids = lambda args: FormulaCentroids(formulas_df, centroids_df)

    def process_segments(centr_segm_n, func):
        return pyspark_context.parallelize(map(func, range(centr_segm_n)))

    msm_search.process_segments = process_segments

    image_metrics_result_list = [
        (pd.DataFrame([(0, 0.95)], columns=['formula_i', 'msm']).set_index('formula_i'),
         {0: np.zeros((1, 1))}),
        (pd.DataFrame([(1, 0.9)], columns=['formula_i', 'msm']).set_index('formula_i'),
         {0: np.zeros((1, 1)), 1: np.zeros((1, 1))})
    ]
    formula_image_metrics_mock.side_effect = image_metrics_result_list

    _, moldb_ion_metrics_df, moldb_ion_images_rdd = next(msm_search.search())

    assert moldb_ion_metrics_df.shape == (2, 5)
    assert moldb_ion_images_rdd.count() == 3

    rmtree(ds_data_path)
