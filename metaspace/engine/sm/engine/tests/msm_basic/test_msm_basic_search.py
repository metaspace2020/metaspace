from unittest.mock import MagicMock, patch
import numpy as np
import pandas as pd
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix

from sm.engine.dataset_reader import DatasetReader
from sm.engine.fdr import FDR
from sm.engine.formula_centroids import CentroidsGenerator, FormulaCentroids
from sm.engine.mol_db import MolecularDB
from sm.engine.msm_basic.msm_basic_search import MSMSearch, init_fdr, collect_ion_formulas, compute_fdr
from sm.engine.tests.util import pyspark_context, ds_config


def make_moldb_mock():
    moldb_mock = MagicMock(spec=MolecularDB)
    moldb_mock.id = 0
    moldb_mock.name = 'test_db'
    moldb_mock.formulas = ['H2O', 'C5H3O']
    return moldb_mock


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


def test_compute_fdr(pyspark_context):
    moldb_fdr_list = init_fdr([make_moldb_mock()], ['+H', '+Na'])
    _, fdr = moldb_fdr_list[0]
    formula_map_df = collect_ion_formulas(moldb_fdr_list).drop('moldb_id', axis=1)

    formula_metrics_df = (pd.DataFrame([(10, 'H3O', 0.99),
                                        (11, 'C5H4O', 0.5),
                                        (12, 'H2ONa', 0.0)],
                                       columns=['formula_i', 'ion_formula', 'msm'])
                          .set_index('formula_i'))
    formula_images = pyspark_context.parallelize([(10, []),
                                                  (11, []),
                                                  (12, [])])

    metrics_df, images = compute_fdr(fdr, formula_metrics_df, formula_images, formula_map_df, max_fdr=0.5)

    assert metrics_df.shape == (2, 5) and images.count() == 2
    assert sorted(metrics_df.columns.tolist()) == sorted(['ion_formula', 'msm', 'formula', 'adduct', 'fdr'])


@patch('sm.engine.msm_basic.msm_basic_search.formula_image_metrics')
def test_search(formula_image_metrics_mock, pyspark_context, ds_config):
    ds_reader_mock = MagicMock(spec=DatasetReader)
    ds_reader_mock.get_dims.return_value = (1, 2)
    ds_reader_mock.get_norm_img_pixel_inds.return_value = np.array([0, 1])
    ds_reader_mock.get_sample_area_mask.return_value = np.array([1, 1])
    ds_reader_mock.get_spectra.return_value = pyspark_context.parallelize([(0, np.arange(5), np.ones(5)),
                                                                           (1, np.arange(5), np.ones(5))])

    msm_search = MSMSearch(pyspark_context, ds_reader_mock, [make_moldb_mock()], ds_config)
    formulas_df = (pd.DataFrame([(0, 'H3O'), (1, 'C5H4O')], columns=['formula_i', 'formula'])
                   .set_index('formula_i'))
    centroids_df = (pd.DataFrame(data=[(0, 0, 1, 100), (0, 1, 2, 10),
                                       (1, 0, 2, 100), (1, 1, 3, 100)],
                                 columns=['formula_i', 'peak_i', 'mz', 'int'])
                    .sort_values(by='mz')
                    .set_index('formula_i'))
    msm_search._fetch_formula_centroids = lambda args: FormulaCentroids(formulas_df, centroids_df)

    formula_image_metrics_mock.return_value = (pd.DataFrame([(0, 0.95), (1, 0.9)], columns=['formula_i', 'msm'])
                                               .set_index('formula_i'))

    _, moldb_ion_metrics_df, moldb_ion_images = next(msm_search.search())

    assert moldb_ion_metrics_df.shape == (2, 5)
    assert moldb_ion_images.count() == 2

