import json
import pytest
from mock import patch, MagicMock

from sm.engine.db import DB
from sm.engine.dataset import Dataset
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.tests.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


@pytest.fixture()
def fill_test_db(create_test_db, drop_test_db):
    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    try:
        db.alter('TRUNCATE dataset CASCADE')
        db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)",
                  [(1, 'ds_name', '/ds_path', json.dumps({}), json.dumps({}))])
        db.alter('TRUNCATE coordinates CASCADE')
    except:
        raise
    finally:
        db.close()


def test_save_ds_meta_ds_doesnt_exist(spark_context, create_test_db, drop_test_db, sm_config, ds_config):
    work_dir_man_mock = MagicMock(WorkDirManager)
    work_dir_man_mock.ds_coord_path = '/ds_path'
    work_dir_man_mock.txt_path = '/txt_path'

    SMConfig._config_dict = sm_config

    with patch('sm.engine.tests.util.SparkContext.textFile') as m:
        m.return_value = spark_context.parallelize([
            '0,1,1\n',
            '1,100,200\n'])

        dataset = Dataset(spark_context, 'ds_name', '', 'input_path', ds_config, work_dir_man_mock, DB(sm_config['db']))
        dataset.save_ds_meta()

    db = DB(sm_config['db'])
    ds_row = db.select_one('SELECT name, file_path, img_bounds, config from dataset')
    assert ds_row == ('ds_name', 'input_path',
                      {u'x': {u'min': 1, u'max': 100}, u'y': {u'min': 1, u'max': 200}},
                      ds_config)

    coord_row = db.select_one('SELECT xs, ys from coordinates')
    assert coord_row == ([1, 100], [1, 200])

    db.close()


# def test_save_ds_meta_ds_exists(spark_context, create_test_db, fill_test_db, drop_test_db, sm_config, ds_config):
#     work_dir_mock = MagicMock(WorkDir)
#     work_dir_mock.ds_coord_path = '/new_ds_path'
#     work_dir_mock.imzml_path = '/new_imzml_path'
#
#     SMConfig._config_dict = sm_config
#
#     with patch('engine.tests.util.SparkContext.textFile') as m:
#         m.return_value = spark_context.parallelize([
#             '0,1,1\n',
#             '1,100,200\n'])
#
#         dataset = Dataset(spark_context, 'ds_name', ds_config, work_dir_mock, DB(sm_config['db']))
#         dataset.save_ds_meta()
#
#     db = DB(sm_config['db'])
#     ds_row = db.select('SELECT name, file_path, img_bounds, config from dataset')
#     assert len(ds_row) == 1
#     assert ds_row[0] == ('ds_name', '/ds_path', {}, {})
#
#     coord_row = db.select('SELECT ds_id, xs, ys from coordinates')
#     assert len(coord_row) == 0
#
#     db.close()
