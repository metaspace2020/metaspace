from io import StringIO

import numpy as np
from sm.engine.util import SMConfig
from unittest.mock import patch

from sm.engine.ms_txt_converter import MsTxtConverter, encode_coord_line, encode_data_line
from sm.engine.tests.util import sm_config, ds_config


def test_encode_data_line():
    mzs, ints = np.array([100.031, 200.059]), np.array([100.01, 10.01])
    assert encode_data_line(3, mzs, ints, decimals=2) == '3|100.03 200.06|100.01 10.01'


def test_encode_coord_line():
    assert encode_coord_line(99, 500, 100) == '99,500,100'
    assert encode_coord_line(-99, -500, -100) == '-99,-500,-100'


@patch('sm.engine.ms_txt_converter.MsTxtConverter._parser_factory')
def test_imzml_txt_converter_parse_save_spectrum(MockImzMLParser, sm_config, ds_config):
    mock_parser = MockImzMLParser.return_value
    mock_parser.coordinates = [[1, 1], [1, 2]]
    mock_parser.getspectrum.side_effect = [(np.array([100., 200.]), np.array([100., 10.])),
                                           (np.array([100., 200.]), np.array([100., 10.]))]

    SMConfig._config_dic = sm_config

    converter = MsTxtConverter('test_ds', '', '')
    converter.parser = mock_parser
    converter.txt_file = StringIO()
    converter.coord_file = StringIO()

    for i, (x, y) in enumerate(mock_parser.coordinates):
        converter.parse_save_spectrum(i, x, y)

    sp_lines = converter.txt_file.getvalue().split('\n')
    assert sp_lines[0] == '0|100.0 200.0|100.0 10.0'
    assert sp_lines[1] == '1|100.0 200.0|100.0 10.0'

    coord_lines = converter.coord_file.getvalue().split('\n')
    assert coord_lines[0] == '0,1,1'
    assert coord_lines[1] == '1,1,2'
