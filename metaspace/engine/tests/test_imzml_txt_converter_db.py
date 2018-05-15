import numpy as np
from unittest.mock import patch

from sm.engine.ms_txt_converter import MsTxtConverter
from sm.engine.util import SMConfig
from sm.engine.tests.util import sm_config, ds_config


@patch('sm.engine.ms_txt_converter.MsTxtConverter._parser_factory')
def test_convert(MockImzMLParser, sm_config):
    mock_parser = MockImzMLParser.return_value
    mock_parser.coordinates = [(1, 1), (1, 2)]
    mock_parser.getspectrum.side_effect = [(np.array([100., 200.]), np.array([100., 10.])),
                                           (np.array([100., 200.]), np.array([100., 10.]))]

    SMConfig._config_dict = sm_config

    converter = MsTxtConverter('imzml_path', 'txt_path', 'coord_path')

    with patch('sm.engine.ms_txt_converter.open', create=True) as mock_open:
        converter.convert()
        mock_open_write_args = [args[0] for _, args, kw_args in mock_open.mock_calls if args]

        assert '0|100.0 200.0|100.0 10.0\n' in mock_open_write_args
        assert '1|100.0 200.0|100.0 10.0\n' in mock_open_write_args

        assert '0,1,1\n' in mock_open_write_args
        assert '1,1,2\n' in mock_open_write_args
