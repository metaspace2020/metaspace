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
        try:
            res = func(*args, **kwargs)
        except Exception as e:
            print e.message
        finally:
            self.conn.commit()
            self.curs.close()
        return res

    return wrapper


class DB(object):

    def __init__(self, config):
        self.conn = psycopg2.connect(**config)
        self.curs = None

    @db_dec
    def select(self, sql, *params):
        self.curs = self.conn.cursor()
        self.curs.execute(sql, params)
        return self.curs.fetchall()

    def select_one(self, sql, *params):
        return self.select(sql, params)[0]

    @db_dec
    def insert(self, sql, rows=[]):
        self.curs = self.conn.cursor()
        self.curs.executemany(sql, rows)
