from scipy.sparse import csr_matrix
import pandas as pd

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
