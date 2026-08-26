import pickle
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from lithops.storage.utils import StorageNoSuchKeyError, CloudObject

from sm.engine.annotation_lithops.io import serialize, deserialize
from sm.engine.annotation_lithops.cache import use_pipeline_cache
from sm.engine.annotation_lithops.moldb_pipeline import CentroidsCacheEntry
from sm.engine.annotation_lithops.annotation_job import _upload_moldbs_from_db


def test_roundtrip_numpy_pandas():
    obj = {'a': np.arange(5, dtype=np.float64), 'df': pd.DataFrame({'x': [1, 2]})}
    out = deserialize(serialize(obj))
    assert np.array_equal(out['a'], obj['a']) and out['df'].equals(obj['df'])


def test_deserialize_accepts_raw_pickle_payload():
    # deserialize() is now pure pickle.loads; a plain pickle payload (as opposed to something
    # serialize() itself would produce, e.g. a legacy pa.serialize buffer) must still load fine.
    assert deserialize(pickle.dumps([1, 2, 3])) == [1, 2, 3]


# Garbage that isn't a valid pickle stream. Includes a marker resembling a legacy
# pyarrow-serialized buffer's magic bytes, plus plain random bytes.
CORRUPT_PAYLOADS = [
    b'ARROW1\x00legacy-pyarrow-serialized-buffer-not-pickle',
    bytes(range(256)) * 4,
]


@pytest.mark.parametrize('corrupt_bytes', CORRUPT_PAYLOADS)
def test_deserialize_rejects_corrupt_payload(corrupt_bytes):
    with pytest.raises(Exception):
        deserialize(corrupt_bytes)


class _StubCacher:
    """Minimal stand-in for PipelineCacher: exists() is True but load() raises, simulating a
    legacy/corrupt cache entry that can no longer be deserialized."""

    def __init__(self, load_exc):
        self._load_exc = load_exc
        self.saved = None

    def exists(self, key):
        return True

    def load(self, key):
        raise self._load_exc

    def save(self, data, key):
        self.saved = (key, data)


@pytest.mark.parametrize('corrupt_bytes', CORRUPT_PAYLOADS)
def test_pipeline_cache_load_failure_falls_back_to_recompute(corrupt_bytes):
    # Exercise the real failure mode end-to-end: deserialize() raising on genuinely corrupt
    # bytes, surfacing through PipelineCacher.load()'s wrapper.
    try:
        deserialize(corrupt_bytes)
        pytest.skip('corrupt payload unexpectedly deserialized without error')
    except Exception as exc:  # noqa: BLE001 - capturing whatever deserialize() actually raises
        load_exc = exc

    calls = {'recomputed': False}

    class _Target:
        def __init__(self):
            self.cacher = _StubCacher(load_exc)

        @use_pipeline_cache
        def stage(self):
            calls['recomputed'] = True
            return 'fresh-result'

    target = _Target()
    result = target.stage()  # must not raise, despite the cache entry being unreadable

    assert result == 'fresh-result'
    assert calls['recomputed'] is True


class _StubStorage:
    """Minimal stand-in for lithops.storage.Storage: returns fixed bytes for get_object."""

    def __init__(self, data=None, missing=False):
        self._data = data
        self._missing = missing

    def get_object(self, bucket, key):
        if self._missing:
            raise StorageNoSuchKeyError(bucket, key)
        return self._data


def _make_cache_entry(storage):
    entry = CentroidsCacheEntry.__new__(CentroidsCacheEntry)
    entry.storage = storage
    entry.bucket = 'test-bucket'
    entry.meta_key = 'test-prefix/meta'
    return entry


@pytest.mark.parametrize('corrupt_bytes', CORRUPT_PAYLOADS)
def test_centroids_cache_entry_load_returns_none_on_corrupt_payload(corrupt_bytes):
    entry = _make_cache_entry(_StubStorage(data=corrupt_bytes))

    result = entry.load()  # must not raise, despite the stored bytes being unreadable

    assert result is None


def test_centroids_cache_entry_load_returns_none_when_key_missing():
    entry = _make_cache_entry(_StubStorage(missing=True))

    assert entry.load() is None


def test_centroids_cache_entry_load_returns_cached_value_on_valid_payload():
    payload = serialize((['db_data'], ['peaks']))
    entry = _make_cache_entry(_StubStorage(data=payload))

    assert entry.load() == (['db_data'], ['peaks'])


class _StubMoldbStorage:
    """Minimal stand-in for lithops.storage.Storage supporting the calls
    _upload_moldbs_from_db makes: head_object, get_cloudobject (via load_cobj) and
    put_cloudobject (via save_cobj)."""

    backend = 'test-backend'

    def __init__(self, existing=None):
        # existing: optional {(bucket, key): raw_bytes} seed data, simulating a pre-existing cobj
        self._objects = dict(existing or {})

    def head_object(self, bucket, key):
        if (bucket, key) not in self._objects:
            raise StorageNoSuchKeyError(bucket, key)

    def get_cloudobject(self, cobj):
        return self._objects[(cobj.bucket, cobj.key)]

    def put_cloudobject(self, data, bucket, key):
        self._objects[(bucket, key)] = data
        return CloudObject(self.backend, bucket, key)


class _StubMoldbDB:
    """Minimal stand-in for sm.engine.db.DB, as used by _upload_moldbs_from_db."""

    def select(self, query, params):
        return [('H2O',), ('CO2',)]

    def select_one(self, query, params):
        return (False,)


@pytest.mark.parametrize('corrupt_bytes', CORRUPT_PAYLOADS)
def test_upload_moldbs_from_db_regenerates_legacy_moldb_blob(corrupt_bytes):
    # Existing-but-unpicklable moldb cobj (as left behind by the removed pa.serialize format)
    # must be regenerated rather than causing _upload_moldbs_from_db to raise.
    bucket, prefix = 'moldb-bucket', 'moldb'
    sm_storage = {'moldb': (bucket, prefix)}
    storage = _StubMoldbStorage(existing={(bucket, f'{prefix}/1'): corrupt_bytes})

    with patch(
        'sm.engine.annotation_lithops.annotation_job.molecular_db.find_by_id'
    ), patch('sm.engine.annotation_lithops.annotation_job.DB', return_value=_StubMoldbDB()):
        moldb_defs = _upload_moldbs_from_db([1], storage, sm_storage)

    assert len(moldb_defs) == 1
    cobject = moldb_defs[0]['cobj']
    # The blob at the same key must have been overwritten with a fresh, valid payload.
    assert deserialize(storage.get_cloudobject(cobject)) == ['H2O', 'CO2']


def test_upload_moldbs_from_db_reuses_valid_existing_blob():
    # A valid existing moldb cobj must be reused as-is, without hitting the DB to regenerate it.
    bucket, prefix = 'moldb-bucket', 'moldb'
    sm_storage = {'moldb': (bucket, prefix)}
    existing_payload = serialize(['existing-formula'])
    storage = _StubMoldbStorage(existing={(bucket, f'{prefix}/1'): existing_payload})

    class _FailingDB:
        def select(self, query, params):
            raise AssertionError('should not query the DB for a valid, already-uploaded moldb')

        def select_one(self, query, params):
            return (False,)

    with patch(
        'sm.engine.annotation_lithops.annotation_job.molecular_db.find_by_id'
    ), patch('sm.engine.annotation_lithops.annotation_job.DB', return_value=_FailingDB()):
        moldb_defs = _upload_moldbs_from_db([1], storage, sm_storage)

    assert len(moldb_defs) == 1
    cobject = moldb_defs[0]['cobj']
    assert deserialize(storage.get_cloudobject(cobject)) == ['existing-formula']
