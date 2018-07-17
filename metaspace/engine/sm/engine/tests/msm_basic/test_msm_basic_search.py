from unittest.mock import MagicMock

import pandas as pd
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix

from sm.engine.fdr import FDR
from sm.engine.ion_centroids_gen import IonCentroidsGenerator
from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.tests.util import pysparkling_context as spark_context


def test_filter_sf_images(spark_context):
    sf_iso_images = spark_context.parallelize([(0, [csr_matrix([[0, 100, 100], [10, 0, 3]]),
                                                    csr_matrix([[0, 50, 50], [0, 20, 0]])]),
                                               (1, [csr_matrix([[0, 0, 0], [0, 0, 0]]),
                                                    csr_matrix([[0, 0, 0], [0, 0, 0]])])])

    sf_metrics_df = (pd.DataFrame([[0, 0.9, 0.9, 0.9, 0.9**3]],
                                  columns=['ion_i', 'chaos', 'spatial', 'spectral', 'msm'])
                     .set_index(['ion_i']))

    search_alg = MSMBasicSearch(sc=None, ds=None, ds_reader=None, mol_db=None,
                                centr_gen=None, fdr=None, ds_config=None)
    flt_iso_images = search_alg.filter_sf_images(sf_iso_images, sf_metrics_df)

    assert dict(flt_iso_images.take(1)).keys() == dict(sf_iso_images.take(1)).keys()


def test_add_sf_image_est_fdr():
    sf_metrics_df = (pd.DataFrame([[0, 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3],
                                  [1, 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3]],
                                  columns=['ion_i', 'chaos', 'spatial', 'spectral',
                                           'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm'])
                     .set_index(['ion_i']))

    centr_gen_mock = MagicMock(spec=IonCentroidsGenerator)
    centr_gen_mock.ion_df = pd.DataFrame([[0, 'H2O', '+H'], [1, 'C2H2', '+H']],
                                         columns=['ion_i', 'sf', 'adduct']).set_index('ion_i')

    fdr_mock = MagicMock(spec=FDR)
    fdr_mock.estimate_fdr.return_value = pd.DataFrame([['H2O', '+H', 0.99], ['C2H2', '+H', 0.5]],
                                                      columns=['sf', 'adduct', 'fdr']).set_index(['sf', 'adduct'])

    search_alg = MSMBasicSearch(sc=None, ds=None, ds_reader=None, mol_db=None,
                                centr_gen=centr_gen_mock, fdr=fdr_mock, ds_config=None)
    res_metrics_df = search_alg.estimate_fdr(sf_metrics_df)

    exp_col_list = ['ion_i', 'chaos', 'spatial', 'spectral',
                    'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm',
                    'sf', 'adduct', 'fdr']
    exp_metrics_df = pd.DataFrame([[0, 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3, 'H2O', '+H', 0.99],
                                   [1, 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3, 'C2H2', '+H', 0.5]],
                                  columns=exp_col_list).set_index(['ion_i'])
    assert_frame_equal(res_metrics_df, exp_metrics_df)
