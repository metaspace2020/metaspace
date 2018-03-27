import os
import json
from datetime import datetime
from subprocess import check_call, call
import logging
from logging.config import dictConfig
from os.path import basename, join, exists, splitext
from pathlib import Path

from sm.engine import Dataset


def proj_root():
    return os.getcwd()

sm_log_formatters = {
    'sm': {
        'format': '%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s'
    }
}

sm_log_config = {
    'version': 1,
    'formatters': sm_log_formatters,
    'handlers': {
        'console_warn': {
            'class': 'logging.StreamHandler',
            'formatter': 'sm',
            'level': logging.WARNING,
        },
        'console_debug': {
            'class': 'logging.StreamHandler',
            'formatter': 'sm',
            'level': logging.DEBUG,
        },
        'file': {
            'class': 'logging.FileHandler',
            'formatter': 'sm',
            'level': logging.DEBUG,
            'filename': '/tmp/sm-engine.log'
        }
    },
    'loggers': {
        'engine': {
            'handlers': ['console_debug', 'file'],
            'level': logging.INFO
        },
        'api': {
            'handlers': ['console_debug'],
            'level': logging.INFO
        },
        'daemon': {
            'handlers': ['console_debug'],
            'level': logging.INFO
        }
    }
}

log_level_codes = {
    'ERROR': logging.ERROR,
    'WARNING': logging.WARNING,
    'INFO': logging.INFO,
    'DEBUG': logging.DEBUG
}


def init_logger(name=None):
    """ Init logger using SM config file
    """
    logs_dir = Path(proj_root()).joinpath('logs')
    if not logs_dir.exists():
        logs_dir.mkdir()

    if name:
        sm_config = SMConfig.get_conf()
        log_config = sm_log_config
        log_config['loggers'][name]['handlers'] = sm_config['loggers'][name]['handlers']
        log_config['loggers'][name]['level'] = log_level_codes[sm_config['loggers'][name]['level']]
        dictConfig(log_config)
    else:
        dictConfig(sm_log_config)


logger = logging.getLogger(name='engine')


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
        cls._path = os.path.realpath(path)

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
                config_path = cls._path or os.path.join(proj_root(), 'conf', 'config.json')
                with open(config_path) as f:
                    cls._config_dict = json.load(f)
            except IOError as e:
                logger.warning(e)
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
        ms_file_extension = splitext(basename(ms_file_path))[1][1:] # skip the leading "."
        return next((h for h in conf['ms_file_handlers'] if ms_file_extension in h['extensions']), None)


def _cmd(template, call_func, *args):
    cmd_str = template.format(*args)
    logger.info('Call "%s"', cmd_str)
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
        logger.warning("Couldn't find %s file", path)
    finally:
        return res


def create_ds_from_files(ds_id, ds_name, ds_input_path):
    base_dir = Path(ds_input_path)

    meta_path = base_dir.joinpath('meta.json')
    if meta_path.exists():
        metadata = json.load(open(str(meta_path)))
    else:
        metadata = {}
    ds_config = json.load(open(str(base_dir.joinpath('config.json'))))

    imzml_path = next(base_dir.glob('*.imzML'))
    ms_file_type_config = SMConfig.get_ms_file_handler(str(imzml_path))
    img_storage_type = ms_file_type_config['img_storage_type']
    return Dataset(id=ds_id, name=ds_name, input_path=ds_input_path, img_storage_type=img_storage_type,
                   upload_dt=datetime.now(), metadata=metadata, config=ds_config)


def split_s3_path(path):
    """ Returns a pair (bucket, key) """
    return path.split('s3a://')[-1].split('/', 1)

