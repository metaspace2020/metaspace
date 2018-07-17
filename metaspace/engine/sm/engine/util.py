import os
import json
from datetime import datetime
from subprocess import check_call, call
import logging
from logging.config import dictConfig
from pathlib import Path
import re
from fnmatch import translate

from sm.engine.dataset import Dataset


def proj_root():
    return os.getcwd()


def init_loggers(config=None):
    """ Init logger using config file, 'logs' section of the sm config
    """
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
        'DEBUG': logging.DEBUG
    }

    def convert_levels(orig_d):
        d = orig_d.copy()
        for k, v in d.items():
            if k == 'level':
                d[k] = log_level_codes[d[k]]
            elif type(v) == dict:
                d[k] = convert_levels(v)
        return d

    log_config = convert_levels(config)
    dictConfig(log_config)


class SMConfig(object):
    """ Engine configuration manager """

    _path = None
    _config_dict = {}

    @classmethod
    def set_path(cls, path):
        """ Set path for a SM configuration file

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
                with open(cls._path) as f:
                    cls._config_dict = json.load(f)
            except IOError as e:
                logging.getLogger('engine').warning(e)
        return cls._config_dict

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
        conf = cls.get_conf()
        ms_file_extension = Path(ms_file_path).suffix[1:].lower()  # skip the leading "."
        return next((h for h in conf['ms_file_handlers'] if ms_file_extension in h['extensions']), None)


def _cmd(template, call_func, *args):
    cmd_str = template.format(*args)
    logging.getLogger('engine').info('Call "%s"', cmd_str)
    return call_func(cmd_str.split())


def cmd_check(template, *args):
    return _cmd(template, check_call, *args)


def cmd(template, *args):
    return _cmd(template, call, *args)


def read_json(path):
    res = {}
    try:
        with open(path) as f:
            res = json.load(f)
    except IOError as e:
        logging.getLogger('engine').warning("Couldn't find %s file", path)
    finally:
        return res


def create_ds_from_files(ds_id, ds_name, ds_input_path):
    base_dir = Path(ds_input_path)
    meta_path = base_dir / 'meta.json'
    if meta_path.exists():
        metadata = json.load(open(str(meta_path)))
    else:
        metadata = {'Data_Type': 'Imaging MS'}
    ds_config = json.load(open(str(base_dir / 'config.json')))

    regexp = re.compile(translate('*.imzML'), re.IGNORECASE)
    imzml_path = [f for f in base_dir.glob('*')
                  if re.match(regexp, str(f))][0]
    ms_file_type_config = SMConfig.get_ms_file_handler(str(imzml_path))
    img_storage_type = ms_file_type_config['img_storage_type']
    return Dataset(ds_id, ds_name, str(ds_input_path), datetime.now(), metadata, ds_config,
                   is_public=True,
                   mol_dbs=ds_config['databases'],
                   adducts=ds_config['isotope_generation']['adducts'],
                   img_storage_type=img_storage_type)


def split_s3_path(path):
    """ Returns a pair (bucket, key) """
    return path.split('s3a://')[-1].split('/', 1)
