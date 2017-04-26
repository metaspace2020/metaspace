from mock import MagicMock
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix
import pandas as pd

from sm.engine import MolecularDB
from sm.engine.fdr import FDR
from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.tests.util import spark_context


def test_filter_sf_images(spark_context):
    sf_iso_images = spark_context.parallelize([(0, [csr_matrix([[0, 100, 100], [10, 0, 3]]),
                                                    csr_matrix([[0, 50, 50], [0, 20, 0]])]),
                                               (1, [csr_matrix([[0, 0, 0], [0, 0, 0]]),
                                                    csr_matrix([[0, 0, 0], [0, 0, 0]])])])

    sf_metrics_df = (pd.DataFrame([[0, '+H', 0.9, 0.9, 0.9, 0.9**3]],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral', 'msm'])
                     .set_index(['sf_id', 'adduct']))

    search_alg = MSMBasicSearch(None, None, None, None, None)
    flt_iso_images = search_alg.filter_sf_images(sf_iso_images, sf_metrics_df)

    assert dict(flt_iso_images.take(1)).keys() == dict(sf_iso_images.take(1)).keys()


def test_add_sf_image_est_fdr():
    sf_metrics_df = (pd.DataFrame([[0, '+H', 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3],
                                  [1, '+H', 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3]],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral',
                                           'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm'])
                     .set_index(['sf_id', 'adduct']))

    mol_db_mock = MagicMock(spec=MolecularDB)
    mol_db_mock.sf_df = pd.DataFrame([[0, '+H'], [1, '+H']], columns=['sf_id', 'adduct'])

    fdr_mock = MagicMock(spec=FDR)
    fdr_mock.estimate_fdr.return_value = pd.DataFrame([[0, '+H', 0.99], [1, '+H', 0.5]],
                                                      columns=['sf_id', 'adduct', 'fdr']).set_index(['sf_id', 'adduct'])

    search_alg = MSMBasicSearch(None, None, None, None, None)
    search_alg._fdr = fdr_mock
    search_alg._mol_db = mol_db_mock
    res_metrics_df = search_alg.estimate_fdr(sf_metrics_df)

    exp_col_list = ['sf_id', 'adduct', 'chaos', 'spatial', 'spectral',
                    'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr']
    exp_metrics_df = pd.DataFrame([[0, '+H', 0.9, 0.9, 0.9, [100.], [0], [10.], 0.9**3, 0.99],
                                   [1, '+H', 0.5, 0.5, 0.5, [100.], [0], [10.], 0.5**3, 0.5]],
                                  columns=exp_col_list).set_index(['sf_id', 'adduct'])
    assert_frame_equal(res_metrics_df, exp_metrics_df)
