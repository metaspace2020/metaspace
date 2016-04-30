from datetime import datetime, date, timedelta
import numpy as np
from os.path import realpath, dirname, join
import os
import json
from subprocess import check_call, call
import logging
from logging.config import dictConfig
from os.path import join


def proj_root():
    return dirname(dirname(dirname(__file__)))


dictConfig({
    'version': 1,
    'formatters': {
        'SM': {
            'format': '%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s'
        }
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'SM',
            'level': 'DEBUG',
        },
    },
    'loggers': {
        'root': {
            'handlers': ['console'],
            'level': logging.DEBUG
        },
        'SM': {
            'handlers': ['console'],
            'level': logging.DEBUG
        }
    }
})
logger = logging.getLogger(name='SM')


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
            config_path = cls._path or join(proj_root(), 'conf', 'config.json')
            with open(config_path) as f:
                cls._config_dict = json.load(f)
        return cls._config_dict


def local_path(path):
    return 'file://' + path


# def hdfs_path(path):
#     return 'hdfs://{}:9000{}'.format(SMConfig.get_conf()['hdfs']['namenode'], path)


def s3_path(path):
    return 's3a://{}'.format(path)


# def hdfs_prefix():
#     return '{}/bin/hdfs dfs '.format(os.environ['HADOOP_HOME'])


def _cmd(template, call_func, *args):
    cmd_str = template.format(*args)
    logger.info('Call "%s"', cmd_str)
    return call_func(cmd_str.split())


def cmd_check(template, *args):
    return _cmd(template, check_call, *args)


def cmd(template, *args):
    return _cmd(template, call, *args)
