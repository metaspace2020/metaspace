import json
import pytest
from mock import patch, MagicMock

from sm.engine.db import DB
from sm.engine.dataset import Dataset
from sm.engine.es_export import ESExporter
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.tests.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


@pytest.fixture()
def fill_test_db(create_test_db, drop_test_db):
    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    try:
        db.alter('TRUNCATE dataset CASCADE')
        db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s, %s)",
                  [('2000-01-01_00:00', 'ds_name', '/ds_path', json.dumps({}), json.dumps({}), json.dumps({}))])
        db.alter('TRUNCATE coordinates CASCADE')
    except:
        raise
    finally:
        db.close()


@patch('sm.engine.dataset.read_json')
def test_update_ds_meta_works(read_json_mock, spark_context, fill_test_db, sm_config, ds_config):
    read_json_mock.return_value = {'key': 'value'}

    work_dir_man_mock = MagicMock(WorkDirManager)
    work_dir_man_mock.ds_coord_path = '/ds_path'
    work_dir_man_mock.txt_path = '/txt_path'
    work_dir_man_mock.ds_metadata_path = '/ds_meta_path'

    es_mock = MagicMock(ESExporter)

    SMConfig._config_dict = sm_config

    with patch('sm.engine.tests.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,1,1\n',
            '1,100,200\n'])

        dataset = Dataset(spark_context, '2000-01-01_00:00', 'ds_name', True, 'input_path',
                          work_dir_man_mock, DB(sm_config['db']), es_mock)
        dataset.copy_read_data()

    db = DB(sm_config['db'])
    ds_row = db.select_one('SELECT id, name, input_path, metadata, img_bounds, config from dataset')
    assert ds_row == ('2000-01-01_00:00', 'ds_name', 'input_path', {'key': 'value'},
                      {u'x': {u'min': 1, u'max': 100}, u'y': {u'min': 1, u'max': 200}},
                      {'key': 'value'})

    coord_row = db.select_one('SELECT xs, ys from coordinates')
    assert coord_row == ([1, 100], [1, 200])

    db.close()


@patch('sm.engine.dataset.read_json')
def test_metadata_not_updated_if_ds_id_is_provided(read_json_mock, spark_context, fill_test_db,
                                                   sm_config, ds_config):
    read_json_mock.return_value = {'key': 'value'}

    work_dir_man_mock = MagicMock(WorkDirManager)
    work_dir_man_mock.ds_coord_path = '/ds_path'
    work_dir_man_mock.txt_path = '/txt_path'
    work_dir_man_mock.ds_metadata_path = '/ds_meta_path'

    es_mock = MagicMock(ESExporter)

    SMConfig._config_dict = sm_config

    with patch('sm.engine.tests.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,1,1\n',
            '1,100,200\n'])

        dataset = Dataset(spark_context, '2000-01-01_00:00', 'ds_name', False, 'input_path',
                          work_dir_man_mock, DB(sm_config['db']), es_mock)
        dataset.copy_read_data()

    db = DB(sm_config['db'])
    ds_row = db.select_one('SELECT id, name, input_path, metadata, img_bounds, config from dataset')
    assert ds_row == ('2000-01-01_00:00', 'ds_name', '/ds_path', {},
                      {"y": {"max": 200, "min": 1}, "x": {"max": 100, "min": 1}}, {})

    db.close()
