from collections import OrderedDict

import numpy as np
import pandas as pd
import pytest
from mock import patch, MagicMock
from numpy.testing import assert_array_almost_equal
from pandas.util.testing import assert_frame_equal
from scipy.sparse import csr_matrix

from sm.engine.dataset_manager import DatasetManager, Dataset
from sm.engine import DatasetReader
from sm.engine.fdr import FDR
from sm.engine.mol_db import MolecularDB
from sm.engine.msm_basic.formula_img_validator import ImgMetrics
from sm.engine.msm_basic.formula_img_validator import sf_image_metrics, get_compute_img_metrics
from sm.engine.tests.util import spark_context, ds_config, sm_config


@patch('sm.engine.msm_basic.formula_img_validator.isotope_pattern_match', return_value=0.95)
@patch('sm.engine.msm_basic.formula_img_validator.isotope_image_correlation', return_value=0.8)
@patch('sm.engine.msm_basic.formula_img_validator.measure_of_chaos', return_value=0.99)
def test_get_compute_img_measures_pass(chaos_mock, image_corr_mock, pattern_match_mock):
    img_gen_conf = {
        'nlevels': 30,
        'do_preprocessing': False,
        'q': 99.0
    }
    empty_matrix = np.zeros((2, 3))
    metrics = OrderedDict([('chaos', 0), ('spatial', 0), ('spectral', 0),
                           ('total_iso_ints', [0, 0, 0, 0]),
                           ('min_iso_ints', [0, 0, 0, 0]),
                           ('max_iso_ints', [0, 0, 0, 0])])
    compute_measures = get_compute_img_metrics(metrics, np.ones(2*3).astype(bool),
                                               empty_matrix, img_gen_conf)

    sf_iso_images = [csr_matrix([[0., 100., 100.], [10., 0., 3.]]),
                     csr_matrix([[0., 50., 50.], [0., 20., 0.]])]
    sf_intensity = [100., 10., 1.]

    measures = compute_measures(sf_iso_images, sf_intensity)
    assert measures == (0.99, 0.8, 0.95, [213., 120., 0.], [0, 0, 0], [100., 50., 0.])


@pytest.fixture(scope='module')
def ds_formulas_images_mock():
    ds_mock = Dataset('ds_id')
    ds_mock.config = {'image_generation': {}}
    ds_mock.reader = MagicMock(DatasetReader)
    ds_mock.reader.get_dims.return_value = (2, 3)
    ds_mock.reader.get_sample_area_mask.return_value = np.ones(2*3).astype(bool)

    mol_db_mock = MagicMock(spec=MolecularDB)
    mol_db_mock.get_sf_peak_ints.return_value = {(0, '+H'): [100, 10, 1], (1, '+H'): [100, 10, 1]}

    sf_iso_images = [((0, '+H'), [csr_matrix([[0, 100, 100], [10, 0, 3]]), csr_matrix([[0, 50, 50], [0, 20, 0]])]),
                     ((1, '+H'), [csr_matrix([[0, 100, 100], [10, 0, 3]]), csr_matrix([[0, 50, 50], [0, 20, 0]])])]

    return ds_mock, mol_db_mock, sf_iso_images


def test_sf_image_metrics(spark_context, ds_formulas_images_mock, ds_config):
    with patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics') as mock:
        mock.return_value = lambda *args: (0.9, 0.9, 0.9, [100., 10.], [0, 0], [10., 1.])

        ds_mock, mol_db_mock, ref_images = ds_formulas_images_mock
        ref_images_rdd = spark_context.parallelize(ref_images)

        metrics = OrderedDict([('chaos', 0), ('spatial', 0), ('spectral', 0),
                               ('total_iso_ints', [0, 0, 0, 0]),
                               ('min_iso_ints', [0, 0, 0, 0]),
                               ('max_iso_ints', [0, 0, 0, 0])])
        metrics_df = sf_image_metrics(ref_images_rdd, metrics, ds_mock, mol_db_mock, spark_context)

        exp_metrics_df = (pd.DataFrame([[0, '+H', 0.9, 0.9, 0.9, [100., 10.], [0, 0], [10., 1.], 0.9**3],
                                       [1, '+H', 0.9, 0.9, 0.9, [100., 10.], [0, 0], [10., 1.], 0.9**3]],
                                       columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral',
                                                'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm'])
                          .set_index(['sf_id', 'adduct']))
        assert_frame_equal(metrics_df, exp_metrics_df)


@pytest.mark.parametrize("nan_value", [None, np.NaN, np.NAN, np.inf])
def test_img_measures_replace_invalid_measure_values(nan_value):
    invalid_img_measures = ImgMetrics(OrderedDict([('chaos', None), ('spatial', np.NAN), ('spectral', np.inf)]))
    assert invalid_img_measures.to_tuple(replace_nan=True) == (0., 0., 0.)


# @pytest.mark.parametrize("invalid_input", [[], np.array([])])
# def test_img_measures_wrong_input_type_assert_exception(invalid_input):
#     with pytest.raises(AssertionError):
#         ImgMeasures(invalid_input, invalid_input, invalid_input)

