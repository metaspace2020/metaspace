import json
import threading
import Queue

from datetime import datetime,date,timedelta
import time

from tornado import gen
from tornado.ioloop import IOLoop

@gen.coroutine
def async_sleep(seconds):
    yield gen.Task(IOLoop.instance().add_timeout, time.time() + seconds)


def delayed(seconds):
	def f(x):
		time.sleep(seconds)
		return x
	return f

def call_in_background(f, *args):
	'''Call function in background in a separate thread / coroutine'''
	result = Queue.Queue(1)
	t = threading.Thread(target=lambda: result.put(f(*args)))
	t.start()
	return result

def get_id_from_slug(slug):
	'''Remove '/' from a part of url if it is present'''
	return slug if slug[-1] != '/' else slug[:-1]

def my_print(s):
	'''Pretty printing with timestamp'''
	print "[" + str(datetime.now()) + "] " + s

class DateTimeEncoder(json.JSONEncoder):
    '''Auxuliary class that lets us encode dates in json'''
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, date):
            return obj.isoformat()
        elif isinstance(obj, timedelta):
            return (datetime.min + obj).time().isoformat()
        else:
            return super(DateTimeEncoder, self).default(obj)


