"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import psycopg2
import psycopg2.extras
from functools import wraps
import traceback
import sys


def db_dec(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        res = []
        try:
            res = func(self, *args, **kwargs)
        except psycopg2.Error as e:
            traceback.print_stack(limit=5)
            print e.message
            print 'SQL: ', args[0]
        else:
            self.conn.commit()
        finally:
            if self.curs:
                self.curs.close()
        return res

    return wrapper


class DB(object):

    def __init__(self, config, autocommit=False):
        self.conn = psycopg2.connect(**config)
        if autocommit:
            self.conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        self.curs = None

    def close(self):
        self.conn.close()

    def valid_params(self, params):
        if type(params) not in [list, tuple]:
            return (params,)
        return params

    @db_dec
    def select(self, sql, params=None):
        self.curs = self.conn.cursor()
        self.curs.execute(sql, self.valid_params(params))
        return self.curs.fetchall()

    def select_one(self, sql, params=None):
        res = self.select(sql, self.valid_params(params))
        return res[0] if len(res) > 0 else []

    @db_dec
    def insert(self, sql, rows=None):
        self.curs = self.conn.cursor()
        self.curs.executemany(sql, rows)

    @db_dec
    def alter(self, sql):
        self.curs = self.conn.cursor()
        self.curs.execute(sql)
