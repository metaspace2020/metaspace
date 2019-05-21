from collections import OrderedDict
from unittest.mock import patch
import numpy as np
import pandas as pd
import pytest
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix

from sm.engine.msm_basic.formula_validator import formula_image_metrics, make_compute_image_metrics, replace_nan
from sm.engine.tests.util import pysparkling_context as spark_context, ds_config, sm_config


@patch('sm.engine.msm_basic.formula_validator.isotope_pattern_match', return_value=0.9)
@patch('sm.engine.msm_basic.formula_validator.isotope_image_correlation', return_value=0.9)
@patch('sm.engine.msm_basic.formula_validator.measure_of_chaos', return_value=0.9)
def test_get_compute_img_measures_pass(chaos_mock, image_corr_mock, pattern_match_mock):
    img_gen_config = {
        'n_levels': 30,
        'do_preprocessing': False,
        'q': 99.0
    }
    sample_area_mask = np.ones((2, 3), dtype=int)
    compute_metrics = make_compute_image_metrics(sample_area_mask, 2, 3, img_gen_config)

    formula_images = [csr_matrix([[0., 100., 100.], [10., 0., 3.]]),
                      csr_matrix([[0., 50., 50.], [0., 20., 0.]])]
    formula_ints = [100., 10., 1.]

    metrics = compute_metrics(formula_images, formula_ints)

    exp_metrics = OrderedDict([('chaos', 0.9), ('spatial', 0.9), ('spectral', 0.9), ('msm', 0.9**3),
                               ('total_iso_ints', [213., 120.]),
                               ('min_iso_ints', [0, 0]),
                               ('max_iso_ints', [100., 50.])])
    assert metrics == exp_metrics


def test_formula_image_metrics():
    exp_metrics = OrderedDict([('chaos', 0.9), ('spatial', 0.9), ('spectral', 0.9), ('msm', 0.9**3),
                               ('total_iso_ints', [213., 120.]),
                               ('min_iso_ints', [0, 0]),
                               ('max_iso_ints', [100., 50.])])

    ref_images = [(0, 0, 100, csr_matrix([[0, 100, 100], [10, 0, 3]])),
                  (0, 1, 10, csr_matrix([[0, 50, 50], [0, 20, 0]])),
                  (1, 0, 100, csr_matrix([[0, 100, 100], [10, 0, 3]])),
                  (1, 1, 10, csr_matrix([[0, 50, 50], [0, 20, 0]]))]

    metrics_df, _ = formula_image_metrics(ref_images, lambda *args: exp_metrics, target_formula_inds={0, 1}, n_peaks=4)

    exp_metrics_df = pd.DataFrame(data=[exp_metrics, exp_metrics], index=pd.Index([0, 1], name='formula_i'))
    assert_frame_equal(metrics_df, exp_metrics_df)


@pytest.mark.parametrize('nan_value', [None, np.NaN, np.NAN, np.inf])
def test__replace_nan(nan_value):
    default_v = 1

    assert replace_nan(nan_value, default_v) == default_v
    assert replace_nan([nan_value] * 4, default_v) == [default_v] * 4
