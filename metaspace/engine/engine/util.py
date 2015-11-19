from datetime import datetime, date, timedelta
import numpy as np
from os.path import realpath, dirname, join
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


class Config(object):
    @classmethod
    def get_config(cls):
        config_path = cls.get_config_path()
        with open(config_path) as f:
            config = json.load(f)
        return config

    @classmethod
    def get_config_path(cls):
        return join(dirname(dirname(realpath(__file__))), 'conf/config.json')
