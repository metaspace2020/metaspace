"""

:synopsis: Database interface

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from functools import wraps

import psycopg2
import psycopg2.extensions
psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)
import psycopg2.extras
import logging


logger = logging.getLogger('engine')


def db_decor(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        res = []
        try:
            # for cases when SQL queries are written to StringIO
            value_getter = getattr(args[0], 'getvalue', None)
            debug_output = args[0] if not value_getter else value_getter()
            logger.debug(debug_output[:1000])
            res = func(self, *args, **kwargs)
        except Exception as e:
            # logger.error('SQL: %s,\nArgs: %s', args[0], str(args[1:])[:1000], exc_info=False)
            self.conn.rollback()
            raise Exception('SQL: {},\nArgs: {}\nError: {}'.format(args[0], str(args[1:])[:1000], e.args[0]))
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

    def _select(self, sql, params=None):
        self.curs = self.conn.cursor()
        self.curs.execute(sql, params) if params else self.curs.execute(sql)
        return self.curs.fetchall()

    @db_decor
    def select(self, sql, params=None):
        """ Execute select query

        Args
        ------------
        sql : string
            sql select query with %s placeholders
        params :
            query parameters for placeholders
        Returns
        ------------
        : list
            list of rows
        """
        return self._select(sql, params)

    @db_decor
    def select_with_fields(self, sql, params):
        rows = self._select(sql, params)
        fields = [desc[0] for desc in self.curs.description]
        return [dict(zip(fields, row)) for row in rows]

    def select_one(self, sql, params=None):
        """ Execute select query and take the first row

        Args
        ------------
        sql : string
            sql select query with %s placeholders
        params :
            query parameters for placeholders
        Returns
        ------------
        : tuple
            single row
        """
        res = self._select(sql, params)
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
    def insert_return(self, sql, rows=None):
        """ Execute insert query

        Args
        ------------
        sql : string
            sql insert query in INSERT INTO TABLE VALUES (%s,...) format
        rows : list
            list of tuples as table rows
        Returns
        ------------
        : list
            inserted ids
        """
        self.curs = self.conn.cursor()
        ids = []
        for row in rows:
            self.curs.execute(sql, row)
            ids.append(self.curs.fetchone()[0])
        return ids

    @db_decor
    def alter(self, sql, params=None):
        """ Execute alter query

        Args
        ------------
        sql : string
            sql alter query with %s placeholders
        params :
            query parameters for placeholders
        """
        self.curs = self.conn.cursor()
        self.curs.execute(sql, params)

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
