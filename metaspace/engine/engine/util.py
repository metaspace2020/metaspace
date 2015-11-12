from datetime import datetime, date, timedelta
import json
import time
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


def txt_to_spectrum(s):
    """Converts a text string in the format to a spectrum in the form of two arrays:
    array of m/z values and array of partial sums of intensities.

    :param s: string id|mz1 mz2 ... mzN|int1 int2 ... intN
    :returns: triple spectrum_id, mzs, cumulative sum of intensities
    """
    arr = s.strip().split("|")
    intensities = np.fromstring("0 " + arr[2], sep=' ')
    return int(arr[0]), np.fromstring(arr[1], sep=' '), np.cumsum(intensities)


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
