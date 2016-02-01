from mock import patch, mock_open, MagicMock, mock
import pytest
import numpy as np
import json

from engine.imzml_txt_converter import ImzmlTxtConverter, ImageBounds
from engine.db import DB
from engine.util import SMConfig
from engine.test.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


@pytest.fixture()
def create_fill_test_db(create_test_db, drop_test_db):

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.alter('TRUNCATE dataset CASCADE')
    db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s)", [(1, 'test_ds', 'fn_path', json.dumps({}))])
    db.alter('TRUNCATE coordinates CASCADE')
    db.close()


@patch('engine.imzml_txt_converter.ImzMLParser')
def test_save_ds_meta_ds_doesnt_exist(ImzMLParserMock, create_test_db, drop_test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config

    converter = ImzmlTxtConverter('test_ds', 'imzml_path', '')
    converter.image_bounds = ImageBounds()
    converter.image_bounds.update(1, 1)
    converter.image_bounds.update(100, 200)

    m = mock_open(read_data='0,1,1\n1,100,200\n')
    with patch('engine.imzml_txt_converter.open', m):
        converter.save_ds_meta()

    db = DB(sm_config['db'])
    ds_row = db.select_one('SELECT id, name, file_path, img_bounds from dataset')
    assert ds_row == (0, 'test_ds', 'imzml_path', {'x': {'min': 1, 'max': 100}, 'y': {'min': 1, 'max': 200}})

    coord_row = db.select_one('SELECT ds_id, xs, ys from coordinates')
    assert coord_row == (0, [1, 100], [1, 200])

    db.close()


@patch('engine.imzml_txt_converter.ImzMLParser')
def test_save_ds_meta_ds_exists(ImzMLParserMock, create_fill_test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config

    converter = ImzmlTxtConverter('test_ds', 'imzml_path', '')
    converter.image_bounds = ImageBounds()
    converter.image_bounds.update(1, 1)
    converter.image_bounds.update(100, 200)

    m = mock_open(read_data='0,1,1\n1,100,200\n')
    with patch('engine.imzml_txt_converter.open', m):
        converter.save_ds_meta()

    db = DB(sm_config['db'])
    ds_row = db.select('SELECT id, name, file_path, img_bounds from dataset')
    assert len(ds_row) == 1
    assert ds_row[0] == (1, 'test_ds', 'fn_path', {})

    coord_row = db.select('SELECT ds_id, xs, ys from coordinates')
    assert len(coord_row) == 0

    db.close()


@patch('engine.imzml_txt_converter.ImzMLParser')
def test_convert(MockImzMLParser, sm_config, ds_config):
    mock_parser = MockImzMLParser.return_value
    mock_parser.coordinates = [[1, 1], [1, 2]]
    mock_parser.getspectrum.side_effect = [(np.array([100., 200.]), np.array([100., 10.])),
                                           (np.array([100., 200.]), np.array([100., 10.]))]

    SMConfig._config_dict = sm_config

    converter = ImzmlTxtConverter('test_ds', 'imzml_path', 'txt_path', 'coord_path')
    converter.save_ds_meta = lambda: 0

    with patch('engine.imzml_txt_converter.open', create=True) as mock_open:
        converter.convert()

        print mock_open.mock_calls
        mock_open_write_args = map(lambda x: x[1][0], filter(lambda x: x[1], mock_open.mock_calls))

        assert '0|100.0 200.0|100.0 10.0\n' in mock_open_write_args
        assert '1|100.0 200.0|100.0 10.0\n' in mock_open_write_args

        assert '0,1,1\n' in mock_open_write_args
        assert '1,1,2\n' in mock_open_write_args


