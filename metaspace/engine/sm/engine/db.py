import logging
import threading
from functools import wraps

from psycopg2.extras import execute_values
import psycopg2.extensions
from psycopg2.pool import ThreadedConnectionPool
from psycopg2 import ProgrammingError, IntegrityError, DataError

psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)

logger = logging.getLogger('engine.db')


class ConnectionPool:
    pool = None

    def __init__(self, config, min_conn=5, max_conn=12):
        logger.info('Initialising database connection pool')
        if not ConnectionPool.pool:
            ConnectionPool.pool = ThreadedConnectionPool(min_conn, max_conn, **config)

    @classmethod
    def close(cls):
        logger.info('Closing database connection pool')
        if cls.pool:
            cls.pool.closeall()
        cls.pool = None

    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    @classmethod
    def is_active(cls):
        return cls.pool is not None

    @classmethod
    def get_conn(cls):
        return cls.pool.getconn()

    @classmethod
    def return_conn(cls, conn):
        return cls.pool.putconn(conn)


class TransactionContext:
    thread_local = threading.local()

    def __init__(self):
        pass

    def __enter__(self):
        logger.debug('Starting transaction')
        assert ConnectionPool.is_active(), "'with ConnectionPool(config):' should be used"
        self.thread_local.conn = ConnectionPool.get_conn()

    def __exit__(self, exc_type, exc_value, exc_tb):
        logger.debug('Finishing transaction')
        if exc_type is None:
            self.thread_local.conn.commit()
        else:
            self.thread_local.conn.rollback()
        ConnectionPool.return_conn(self.thread_local.conn)
        self.thread_local.conn = None

        return exc_type is None  # return False to re-raise exception

    @classmethod
    def is_active(cls):
        return bool(getattr(cls.thread_local, 'conn', None))

    @classmethod
    def get_conn(cls):
        return getattr(cls.thread_local, 'conn', None)


class DB:
    """Postgres database access provider."""

    def __init__(self):
        self._curs = None

    def transaction(func):

        @wraps(func)
        def wrapper(self, sql, *args, **kwargs):

            def get_conn_call_func():
                # For cases when SQL queries are written to StringIO
                value_getter = getattr(sql, 'getvalue', None)
                debug_output = sql if not value_getter else value_getter()
                logger.debug(debug_output[:1000])

                conn = TransactionContext.get_conn()
                with conn.cursor() as curs:
                    self._curs = curs
                    return func(self, sql, *args, **kwargs)

            res = None
            if TransactionContext.is_active():
                res = get_conn_call_func()
            else:
                with TransactionContext():
                    res = get_conn_call_func()

            return res
        return wrapper

    def _add_fields(self, rows):
        fields = [desc[0] for desc in self._curs.description]
        return [dict(zip(fields, row)) for row in rows]

    def _select(self, sql, params=None, one=False, fields=False):
        if params:
            self._curs.execute(sql, params)
        else:
            self._curs.execute(sql)
        rows = self._curs.fetchall()
        if fields:
            rows = self._add_fields(rows)
        if one:
            assert len(rows) in {0, 1}, "Requested one row, got {}".format(len(rows))
            return rows[0] if rows else []
        return rows

    @transaction
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

    @transaction
    def select_with_fields(self, sql, params=None):
        return self._select(sql, params, fields=True)

    @transaction
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
        return self._select(sql, params, one=True)

    @transaction
    def select_one_with_fields(self, sql, params=None):
        return self._select(sql, params, one=True, fields=True)

    @transaction
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

    @transaction
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

    @transaction
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

    @transaction
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

    @transaction
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
