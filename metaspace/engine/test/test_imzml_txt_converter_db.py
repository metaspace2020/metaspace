from mock import patch, mock_open, MagicMock, mock
import pytest
import numpy as np
import json

from engine.imzml_txt_converter import ImzmlTxtConverter
from engine.db import DB
from engine.util import SMConfig
from engine.test.util import spark_context, sm_config, ds_config


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


