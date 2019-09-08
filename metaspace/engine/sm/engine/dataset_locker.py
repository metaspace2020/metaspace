from contextlib import contextmanager
from zlib import adler32

from psycopg2 import connect

LOCK_KEY = 894951


class DatasetLocker:  # noqa
    def __init__(self, dbconfig):
        self._dbconfig = dbconfig

    @contextmanager
    def lock(self, ds_id, timeout=60):
        ds_hash = adler32(ds_id.encode('utf-8'))
        conn = connect(**self._dbconfig)
        try:
            with conn.cursor() as curs:
                curs.execute('SET statement_timeout = %s;', (timeout * 1000,))
                curs.execute('SELECT pg_advisory_lock(%s, %s);', (LOCK_KEY, ds_hash))
                yield None
                curs.execute('SELECT pg_advisory_unlock(%s, %s);', (LOCK_KEY, ds_hash))
        finally:
            conn.close()
