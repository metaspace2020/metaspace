"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from functools import wraps
from traceback import format_exc

import psycopg2
import psycopg2.extensions
psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)
import psycopg2.extras

from sm.engine.util import logger


def db_decor(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        res = []
        try:
            logger.debug(args[0])
            res = func(self, *args, **kwargs)
        except Exception as e:
            logger.error(format_exc())
            logger.error('SQL: %s\n%s', args[0], str(args[1:])[:1000])
        else:
            self.conn.commit()
        finally:
            if self.curs:
                self.curs.close()
        return res

    return wrapper


class DB(object):
    """ Postgres database access provider

    Args
    ----------
    config : dict
        database access parameters
    autocommit : bool
        enable non-transactional client mode
    """

    def __init__(self, config, autocommit=False):
        self.conn = psycopg2.connect(**config)
        if autocommit:
            self.conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        self.curs = None

    def close(self):
        """ Close the connection to the database """
        self.conn.close()

    @db_decor
    def select(self, sql, *args):
        """ Execute select query

        Args
        ------------
        sql : string
            sql select query with %s placeholders
        args :
            query parameters for placeholders
        Returns
        ------------
        : list
            list of rows
        """
        self.curs = self.conn.cursor()
        self.curs.execute(sql, args)
        return self.curs.fetchall()

    def select_one(self, sql, *args):
        """ Execute select query and take the first row

        Args
        ------------
        sql : string
            sql select query with %s placeholders
        args :
            query parameters for placeholders
        Returns
        ------------
        : tuple
            single row
        """
        res = self.select(sql, *args)
        assert len(res) in [0, 1], "Requested one row, got {}".format(len(res))
        return res[0] if len(res) > 0 else []

    @db_decor
    def insert(self, sql, rows=None):
        """ Execute insert query

        Args
        ------------
        sql : string
            sql insert query in INSERT INTO TABLE VALUES (%s,...) format
        rows : list
            list of tuples as table rows
        """
        self.curs = self.conn.cursor()
        self.curs.executemany(sql, rows)

    @db_decor
    def alter(self, sql, *args):
        """ Execute alter query

        Args
        ------------
        sql : string
            sql alter query with %s placeholders
        args :
            query parameters for placeholders
        """
        self.curs = self.conn.cursor()
        self.curs.execute(sql, args)

    @db_decor
    def copy(self, inp_file, table, sep='\t', columns=None):
        """ Copy data from a file to a table

        Args
        ------------
        inp_file : file
            file-like object containing csv data
        table : string
            table to insert new rows into
        sep : string
            field separator
        columns : list
            column names to insert into
        """
        self.curs = self.conn.cursor()
        self.curs.copy_from(inp_file, table=table, sep=sep, columns=columns)
