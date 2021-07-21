import logging
import re
import os
from pathlib import Path
from typing import Dict

from sm.engine.config import init_loggers, SMConfig

logger = logging.getLogger('engine')


####################################################################################################
############################### DON'T ADD NEW FUNCTIONS TO THIS FILE ###############################
#### It's a frequent source of unwanted & circular imports. Create a new file in utils/ instead. ###
####################################################################################################


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
    return re.sub(r'^cos://', '', path).split(sep='/', maxsplit=1)


def find_file_by_ext(path, ext):
    return next(str(p) for p in Path(path).iterdir() if str(p).lower().endswith(ext))


def populate_aws_env_vars(aws_config):
    for env_var, val in aws_config.items():
        os.environ.setdefault(env_var.upper(), val)


def on_startup(config_path: str) -> Dict:
    from sm.engine import image_storage  # pylint: disable=import-outside-toplevel,cyclic-import

    SMConfig.set_path(config_path)
    sm_config = SMConfig.get_conf()

    init_loggers(sm_config['logs'])
    if 'aws' in sm_config:
        populate_aws_env_vars(sm_config['aws'])

    image_storage.init(sm_config)

    return sm_config


class GlobalInit:
    def __init__(self, config_path='conf/config.json'):
        from sm.engine.db import ConnectionPool  # pylint: disable=import-outside-toplevel

        self.sm_config = on_startup(config_path)
        self.pool = ConnectionPool(self.sm_config['db'])

    def __enter__(self):
        return self.sm_config

    def __exit__(self, ext_type, ext_value, traceback):
        self.pool.close()
