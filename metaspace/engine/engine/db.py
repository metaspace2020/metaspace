"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import psycopg2
import psycopg2.extras
from functools import wraps


def db_dec(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        res = []
        curs = self.conn.cursor()
        try:
            res = func(*args, **kwargs)
        except Exception as e:
            print e.message
        finally:
            curs.close()
        return res

    return wrapper


class DB(object):

    def __init__(self, config):
        self.conn = psycopg2.connect(**config)

    @db_dec
    def select(self, sql, params=None):
        curs = self.conn.cursor()
        curs.execute(sql, params)
        return curs.fetchall()
