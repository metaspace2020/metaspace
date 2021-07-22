import json
import logging
import os
from copy import deepcopy
from logging.config import dictConfig
from pathlib import Path
from typing import Dict


logger = logging.getLogger('engine')


def proj_root():
    return os.getcwd()


def init_loggers(config=None):
    """Init logger using config file, 'logs' section of the sm config"""
    if not config:
        SMConfig.set_path('conf/config.json')
        config = SMConfig.get_conf()['logs']

    logs_dir = Path(proj_root()).joinpath('logs')
    if not logs_dir.exists():
        logs_dir.mkdir()

    log_level_codes = {
        'ERROR': logging.ERROR,
        'WARNING': logging.WARNING,
        'INFO': logging.INFO,
        'DEBUG': logging.DEBUG,
    }

    def convert_levels(orig_dic):
        dic = orig_dic.copy()
        for k, v in dic.items():
            if k == 'level':
                dic[k] = log_level_codes[dic[k]]
            elif isinstance(v, dict):
                dic[k] = convert_levels(v)
        return dic

    log_config = convert_levels(config)
    dictConfig(log_config)


class SMConfig:
    """ Engine configuration manager """

    _path = 'conf/config.json'
    _config_dict: Dict = {}

    @classmethod
    def set_path(cls, path):
        """Set path for a SM configuration file

        Parameters
        ----------
        path : String
        """
        cls._path = os.path.realpath(str(path))

    @classmethod
    def get_conf(cls, update=False):
        """
        Returns
        -------
        : dict
            SM engine configuration
        """
        assert cls._path
        if update or not cls._config_dict:
            try:
                with open(cls._path) as file:
                    cls._config_dict = json.load(file)
            except IOError as e:
                logger.warning(e)
        return deepcopy(cls._config_dict)

    @classmethod
    def get_ms_file_handler(cls, ms_file_path):
        """
        Parameters
        ----------
        ms_file_path : String

        Returns
        -------
        : dict
            SM configuration for handling specific type of MS data
        """
        handlers = [
            {
                "type": "ims",
                "extensions": ["imzml", "ibd"],
            },
            {
                "type": "lcms",
                "extensions": ["mzml"],
            },
        ]
        ms_file_extension = Path(ms_file_path).suffix[1:].lower()  # skip the leading "."
        return next((h for h in handlers if ms_file_extension in h['extensions']), None)
