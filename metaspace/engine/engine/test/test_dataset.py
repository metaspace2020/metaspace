from mock import patch, mock_open
from numpy.testing import assert_array_equal
import numpy as np
import pytest

from engine.dataset import Dataset
from engine.util import SMConfig
from engine.test.util import spark_context, sm_config


# @pytest.fixture
# def coord_file_content():
#     return (
#         '0,0,1\n'
#         '1,2,2\n'
#         '2,2,1\n'
#         '3,0,2\n'
#         '4,1,2\n')


def test_get_dims_2by3(spark_context, sm_config):
    with patch('engine.test.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,0,1\n',
            '1,2,2\n',
            '2,2,1\n',
            '3,0,2\n',
            '4,1,2\n'])

        SMConfig._config_dict = sm_config
        ds = Dataset(spark_context, '', '/fn')

        m.assert_called_once_with('file:///fn')
        assert ds.get_dims() == (2, 3)


def test_get_norm_img_pixel_inds_2by3(spark_context, sm_config):
    with patch('engine.test.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,0,1\n',
            '1,2,2\n',
            '2,2,1\n',
            '3,0,2\n',
            '4,1,2\n'])
    # m = mock_open(read_data=coord_file_content)
    # with patch('engine.dataset.open', m):
        SMConfig._config_dict = sm_config
        ds = Dataset(spark_context, '', '/fn')

        m.assert_called_once_with('file:///fn')
        assert_array_equal(ds.get_norm_img_pixel_inds(), [0, 5, 2, 3, 4])


def test_get_spectra_2by3(spark_context, sm_config):
    with patch('engine.test.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0|100|100\n',
            '1|101|0\n',
            '2|102|0\n',
            '3|103|0\n',
            '4|200|10\n'])

        with patch('engine.test.test_dataset.Dataset._define_pixels_order'):
            SMConfig._config_dict = sm_config
            ds = Dataset(spark_context, '/fn', '')
            res = ds.get_spectra().collect()
            exp_res = [(0, np.array([100.]), np.array([0., 100.])),
                       (1, np.array([101.]), np.array([0., 0.])),
                       (2, np.array([102.]), np.array([0., 0.])),
                       (3, np.array([103.]), np.array([0., 0.])),
                       (4, np.array([200.]), np.array([0., 10.]))]

            m.assert_called_once_with('file:///fn')
            assert len(res) == len(exp_res)

            for r, exp_r in zip(res, exp_res):
                assert len(r) == len(exp_r)
                assert r[0] == r[0]
                assert_array_equal(r[1], exp_r[1])
                assert_array_equal(r[2], exp_r[2])
