import json
import logging
import re
from datetime import datetime
from functools import wraps
from logging.config import dictConfig
import os
from copy import deepcopy
from pathlib import Path
import random
from time import sleep
from typing import Dict


logger = logging.getLogger('engine')


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
        conf = cls.get_conf()
        ms_file_extension = Path(ms_file_path).suffix[1:].lower()  # skip the leading "."
        return next(
            (h for h in conf['ms_file_handlers'] if ms_file_extension in h['extensions']), None
        )


def create_ds_from_files(ds_id, ds_name, ds_input_path, config_path=None, meta_path=None):
    # Avoid importing these globally so that Lithops can run without psycopg2, etc.
    from sm.engine import molecular_db  # pylint: disable=import-outside-toplevel
    from sm.engine.dataset import Dataset  # pylint: disable=import-outside-toplevel

    config_path = config_path or Path(ds_input_path) / 'config.json'
    ds_config = json.load(open(config_path))
    if 'database_ids' not in ds_config:
        ds_config['database_ids'] = [
            molecular_db.find_by_name(db, True).id for db in ds_config['databases']
        ]

    meta_path = meta_path or Path(ds_input_path) / 'meta.json'
    if not Path(meta_path).exists():
        raise Exception('meta.json not found')
    metadata = json.load(open(str(meta_path)))

    return Dataset(
        id=ds_id,
        name=ds_name,
        input_path=str(ds_input_path),
        upload_dt=datetime.now(),
        metadata=metadata,
        is_public=True,
        config=ds_config,
    )


def split_s3_path(path):
    """
    Returns
    ---
        tuple[string, string]
    Returns a pair of (bucket, key)
    """
    return re.sub(r'^s3a?://', '', path).split(sep='/', maxsplit=1)


def split_cos_path(path):
    """
    Returns
    ---
        tuple[string, string]
    Returns a pair of (bucket, key)
    """
    return re.sub(r'^cos?://', '', path).split(sep='/', maxsplit=1)


def find_file_by_ext(path, ext):
    return next(str(p) for p in Path(path).iterdir() if str(p).lower().endswith(ext))


def bootstrap_and_run(config_path, func):
    from sm.engine.db import ConnectionPool  # pylint: disable=import-outside-toplevel

    SMConfig.set_path(config_path)
    sm_config = SMConfig.get_conf()
    init_loggers(sm_config['logs'])

    with ConnectionPool(sm_config['db']):
        func(sm_config)


def populate_aws_env_vars(aws_config):
    for env_var, val in aws_config.items():
        os.environ.setdefault(env_var.upper(), val)


class GlobalInit:
    def __init__(self, config_path='conf/config.json'):
        from sm.engine.db import ConnectionPool  # pylint: disable=import-outside-toplevel

        SMConfig.set_path(config_path)
        self.sm_config = SMConfig.get_conf()

        init_loggers(self.sm_config['logs'])
        populate_aws_env_vars(self.sm_config['aws'])
        self.pool = ConnectionPool(self.sm_config['db'])

    def __enter__(self):
        return self.sm_config

    def __exit__(self, ext_type, ext_value, traceback):
        self.pool.close()


def retry_on_exception(exception_type=Exception, num_retries=3):
    def decorator(func):
        func_name = getattr(func, '__name__', 'Function')

        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(num_retries):
                try:
                    return func(*args, **kwargs)
                except exception_type as e:
                    delay = random.uniform(2, 5 + i * 3)
                    logger.warning(
                        f'{func_name} raised {type(e)} on attempt {i+1}. '
                        f'Retrying after {delay:.1f} seconds...'
                    )
                    sleep(delay)
            # Last attempt, don't catch the exception
            return func(*args, **kwargs)

        return wrapper

    return decorator
