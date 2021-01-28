import logging
import re
from functools import wraps
import os
from pathlib import Path
import random
from time import sleep

from sm.engine.config import init_loggers, SMConfig

logger = logging.getLogger('engine')


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


def retry_on_exception(exception_type=Exception, num_retries=3, retry_wait_params=(2, 3, 5)):
    def decorator(func):
        func_name = getattr(func, '__name__', 'Function')

        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(num_retries):
                try:
                    return func(*args, **kwargs)
                except exception_type as e:
                    wait_initial, wait_increase, jitter = retry_wait_params
                    min_wait = wait_initial + i * wait_increase
                    delay = random.uniform(min_wait, min_wait + jitter)
                    logger.warning(
                        f'{func_name} raised {type(e)} on attempt {i+1}. '
                        f'Retrying after {delay:.1f} seconds...'
                    )
                    sleep(delay)
            # Last attempt, don't catch the exception
            return func(*args, **kwargs)

        return wrapper

    return decorator
