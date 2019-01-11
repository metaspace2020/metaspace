from unittest.mock import MagicMock

import pandas as pd
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix

from sm.engine.fdr import FDR
from sm.engine.ion_centroids import IonCentroidsGenerator, IonCentroids
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
                                ion_centroids=None, fdr=None, ds_config=None)
    flt_iso_images = search_alg.filter_sf_images(sf_iso_images, sf_metrics_df)

    assert dict(flt_iso_images.take(1)).keys() == dict(sf_iso_images.take(1)).keys()


def test_estimate_fdr():
    sf_metrics_df = (pd.DataFrame([['H2O', '+H', 0, 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3],
                                  ['C2H2', '+H', 1, 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3]],
                                  columns=['formula', 'adduct', 'ion_i', 'chaos', 'spatial', 'spectral',
                                           'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm'])
                     .set_index(['ion_i']))

    ion_centroids = MagicMock(spec=IonCentroids)
    ion_centroids.ions_df = pd.DataFrame([[0, 'H2O', '+H'], [1, 'C2H2', '+H']],
                                         columns=['ion_i', 'formula', 'adduct']).set_index('ion_i')

    fdr_mock = MagicMock(spec=FDR)
    fdr_mock.estimate_fdr.return_value = (pd.DataFrame([['H2O', '+H', 0.99], ['C2H2', '+H', 0.5]],
                                                       columns=['formula', 'adduct', 'fdr'])
                                          .set_index(['formula', 'adduct']))

    search_alg = MSMBasicSearch(sc=None, ds=None, ds_reader=None, mol_db=None,
                                ion_centroids=ion_centroids, fdr=fdr_mock, ds_config=None)
    res_metrics_df = search_alg.estimate_fdr(sf_metrics_df)

    exp_col_list = ['formula', 'adduct', 'ion_i', 'chaos', 'spatial', 'spectral',
                    'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr']
    exp_metrics_df = pd.DataFrame([['H2O', '+H', 0, 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3, 0.99],
                                   ['C2H2', '+H', 1, 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3, 0.5]],
                                  columns=exp_col_list).set_index(['ion_i'])
    assert_frame_equal(res_metrics_df, exp_metrics_df)
