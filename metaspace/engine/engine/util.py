from datetime import datetime, date, timedelta
import numpy as np
from os.path import realpath, dirname, join
import os
import json
from subprocess import check_call, call


def proj_root():
    return dirname(dirname(__file__))


class SMConfig(object):
    _path = None
    _config_dict = {}

    @classmethod
    def set_path(cls, path):
        cls._path = path

    @classmethod
    def get_conf(cls):
        if not cls._config_dict:
            config_path = cls._path or join(proj_root(), 'conf', 'config.json')
            with open(config_path) as f:
                return json.load(f)
        return cls._config_dict


def local_path(path):
    return 'file://' + path


def hdfs_path(path):
    return 'hdfs://{}:9000{}'.format(SMConfig.get_conf()['hdfs']['namenode'], path)


def hdfs_prefix():
    return '{}/bin/hdfs dfs '.format(os.environ['HADOOP_HOME'])


def cmd_check(template, *args):
    cmd = template.format(*args)
    print 'Call ', cmd
    return check_call(cmd.split())


def cmd(template, *args):
    cmd = template.format(*args)
    print 'Call ', cmd
    return call(cmd.split())
