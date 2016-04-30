
import json
import numpy as np
from datetime import datetime, date, timedelta


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

