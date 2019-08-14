import logging
from functools import wraps
from weakref import WeakSet

from psycopg2.extras import execute_values
import psycopg2.extensions
from psycopg2.pool import ThreadedConnectionPool
psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)


logger = logging.getLogger('engine')
_conn_pool = None


def init_conn_pool(config):
    global _conn_pool
    if not _conn_pool:
        _conn_pool = ThreadedConnectionPool(4, 12, **config)


def close_conn_pool():
    global _conn_pool
    if _conn_pool:
        _conn_pool.closeall()


def db_decor(func):

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        conn = None
        res = []
        try:
            # for cases when SQL queries are written to StringIO
            value_getter = getattr(args[0], 'getvalue', None)
            debug_output = args[0] if not value_getter else value_getter()
            logger.debug(debug_output[:1000])

            conn = _conn_pool.getconn()
            self._curs = conn.cursor()
            res = func(self, *args, **kwargs)
        except psycopg2.ProgrammingError as e:
            conn.rollback()
            raise Exception('SQL: {},\nArgs: {}\nError: {}'.format(args[0], str(args[1:])[:1000], e.args[0]))
        else:
            conn.commit()
            self._curs.close()
        finally:
            _conn_pool.putconn(conn)
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

    def __init__(self):
        self._curs = None

    def _select(self, sql, params=None):
        self._curs.execute(sql, params) if params else self._curs.execute(sql)
        return self._curs.fetchall()

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
        fields = [desc[0] for desc in self._curs.description]
        return [dict(zip(fields, row)) for row in rows]

    @db_decor
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
        self._curs.executemany(sql, rows)

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
        ids = []
        for row in rows:
            self._curs.execute(sql, row)
            ids.append(self._curs.fetchone()[0])
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
        self._curs.execute(sql, params)

    @db_decor
    def alter_many(self, sql, rows=None):
        """ Execute alter query

        Args
        ------------
        sql: string
            sql alter query with %s placeholders
        rows:
            Iterable of query parameters for placeholders
        """
        execute_values(self._curs, sql, rows)

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
        self._curs.copy_from(inp_file, table=table, sep=sep, columns=columns)
