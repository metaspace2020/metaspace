from contextlib import contextmanager
from zlib import adler32

from psycopg2 import connect

from sm.engine.config import SMConfig

LOCK_KEY = 894951


class DBMutex:
    """
    Database-backed mutex for preventing multiple threads/processes from accessing the same
    shared resource simultaneously. Resources are specified as strings, which are simply hashed
    into a 32 bit value and locked in Postgres.
    """

    def __init__(self, dbconfig=None):
        self._dbconfig = dbconfig or SMConfig.get_conf()['db']

    @contextmanager
    def lock(self, resource_name, timeout=60):
        resource_hash = adler32(resource_name.encode('utf-8'))
        conn = connect(**self._dbconfig)
        try:
            with conn.cursor() as curs:
                curs.execute('SET statement_timeout = %s;', (timeout * 1000,))
                curs.execute('SELECT pg_advisory_lock(%s, %s);', (LOCK_KEY, resource_hash))
                yield None
                curs.execute('SELECT pg_advisory_unlock(%s, %s);', (LOCK_KEY, resource_hash))
        finally:
            conn.close()
