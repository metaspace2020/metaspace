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
        # Postgres enforces that the lock keys can be stored as 32-bit signed integers,
        # so the value is truncated to 31 bits for ease.
        # Adler's not a great hash function, but it's good enough for this purpose (collisions can
        # only cause delays) and is the most convenient way to get a small integer hash.
        # Over a year of use, adler32 didn't return a value above 2^31-1. It was only when
        # the format of resource_name changed that the signed integer limitation was discovered.
        resource_hash = adler32(resource_name.encode('utf-8')) & 0x7FFFFFFF
        conn = connect(**self._dbconfig)
        try:
            with conn.cursor() as curs:
                curs.execute('SET statement_timeout = %s;', (timeout * 1000,))
                curs.execute('SELECT pg_advisory_lock(%s, %s);', (LOCK_KEY, resource_hash))
                yield None
                curs.execute('SELECT pg_advisory_unlock(%s, %s);', (LOCK_KEY, resource_hash))
        finally:
            conn.close()
