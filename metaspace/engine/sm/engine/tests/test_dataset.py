import numpy as np
from mock import patch, MagicMock
from numpy.testing import assert_array_equal

from sm.engine.dataset import Dataset
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.tests.util import sm_config, ds_config, spark_context


def test_get_sample_area_mask_correctness(sm_config, ds_config, spark_context):
    work_dir_man_mock = MagicMock(WorkDirManager)
    work_dir_man_mock.ds_coord_path = '/ds_path'
    work_dir_man_mock.txt_path = '/txt_path'

    SMConfig._config_dict = sm_config

    with patch('sm.engine.tests.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,0,0\n',
            '2,1,1\n'])

        ds = Dataset(spark_context, 'ds_id', '', 'input_path', ds_config, work_dir_man_mock, None)

        assert tuple(ds.get_sample_area_mask()) == (True, False, False, True)


@patch('sm.engine.dataset.Dataset._define_pixels_order')
@patch('sm.engine.dataset.read_json')
def test_choose_name_from_metadata(read_json_mock, _define_pixes_order_mock):
    read_json_mock.return_value = {'metaspace_options': {'Dataset_Name': 'foobar'}}
    _define_pixes_order_mock.return_value = None
    work_dir_man_mock = MagicMock(WorkDirManager)
    work_dir_man_mock.ds_metadata_path = '/ds_metadata_path'

    ds = Dataset(None, 'ds_id', None, '', {}, work_dir_man_mock, None)

    assert ds.name == 'foobar'
