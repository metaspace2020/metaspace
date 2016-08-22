import os
import json
from subprocess import check_call, call
import logging
from logging.config import dictConfig
from os.path import join


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
            'filename': 'logs/sm-engine.log'
        }
    },
    'loggers': {
        # 'root': {
        #     'handlers': ['console'],
        #     'level': logging.DEBUG
        # },
        'sm-engine': {
            'handlers': ['console_debug', 'file'],
            'level': logging.DEBUG
        },
        'sm-job-daemon': {
            'handlers': ['console_debug'],
            'level': logging.DEBUG
        }
    }
}


def init_logger(log_config=None):
    dictConfig(log_config if log_config else sm_log_config)


logger = logging.getLogger(name='sm-engine')


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
        cls._path = path

    @classmethod
    def get_conf(cls):
        """
        Returns
        -------
        : dict
            SM engine configuration
        """
        if not cls._config_dict:
            try:
                config_path = cls._path or join(proj_root(), 'conf', 'config.json')
                with open(config_path) as f:
                    cls._config_dict = json.load(f)
            except IOError as e:
                logger.warning(e)
        return cls._config_dict


def local_path(path):
    return 'file://' + path


def s3_path(path):
    return 's3a://{}'.format(path)


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
