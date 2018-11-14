from contextlib import contextmanager
from psycopg2.pool import ThreadedConnectionPool
from zlib import adler32


LOCK_KEY = 894951
MIN_CONNS = 1
MAX_CONNS = 2

class DatasetLocker(object):
    def __init__(self, dbconfig):
        self._pool = ThreadedConnectionPool(MIN_CONNS, MAX_CONNS, **dbconfig)

    @contextmanager
    def lock(self, ds_id, timeout=60):
        hash = adler32(ds_id.encode('utf-8'))
        conn = self._pool.getconn()
        try:
            with conn.cursor() as curs:
                curs.execute('SET statement_timeout = %s;', (timeout * 1000,))
                curs.execute('SELECT pg_advisory_lock(%s, %s);', (LOCK_KEY, hash))
                yield None
                curs.execute('SELECT pg_advisory_unlock(%s, %s);', (LOCK_KEY, hash))
        except:
            self._pool.putconn(conn, close=True)
            raise
        else:
            self._pool.putconn(conn)
