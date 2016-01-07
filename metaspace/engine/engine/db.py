"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import psycopg2
import psycopg2.extras
from functools import wraps
from traceback import format_exc

from engine.util import logger


def db_dec(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        res = []
        try:
            logger.debug(args[0])
            res = func(self, *args, **kwargs)
        except psycopg2.Error as e:
            logger.error(format_exc())
            logger.error('SQL: %s', args[0])
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

    @db_dec
    def select(self, sql, *args):
        self.curs = self.conn.cursor()
        self.curs.execute(sql, args)
        return self.curs.fetchall()

    def select_one(self, sql, *args):
        res = self.select(sql, *args)
        return res[0] if len(res) > 0 else []

    @db_dec
    def insert(self, sql, rows=None):
        self.curs = self.conn.cursor()
        self.curs.executemany(sql, rows)

    @db_dec
    def alter(self, sql, *args):
        self.curs = self.conn.cursor()
        self.curs.execute(sql, args)

    @db_dec
    def copy(self, inp_file, table, sep='\t', columns=None):
        self.curs = self.conn.cursor()
        self.curs.copy_from(inp_file, table=table, sep=sep, columns=columns)
