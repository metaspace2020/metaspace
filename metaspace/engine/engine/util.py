from datetime import datetime, date, timedelta
import numpy as np
from os.path import realpath, dirname, join
import os
import json


def my_print(s):
    '''Pretty printing with timestamp'''
    print "[" + str(datetime.now()) + "] " + s


class DateTimeEncoder(json.JSONEncoder):
    '''Auxuliary class that lets us encode dates in json'''

    def default(self, obj):
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        elif isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, date):
            return obj.isoformat()
        elif isinstance(obj, timedelta):
            return (datetime.min + obj).time().isoformat()
        elif isinstance(obj, np.generic):
            return np.asscalar(obj)
        else:
            return super(DateTimeEncoder, self).default(obj)


def proj_root():
    return dirname(dirname(__file__))


def sm_config():
    with open(join(proj_root(), 'conf', 'config.json')) as f:
        return json.load(f)


def local_path(path):
    return 'file://' + path


def hdfs_path(path):
    return 'hdfs://{}:9000{}'.format(sm_config()['hdfs']['namenode'], path)


def hdfs(cmd):
    return '{}/bin/hdfs dfs {}'.format(os.environ['HADOOP_HOME'], cmd)

