from __future__ import annotations

import logging
import pickle
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TypeVar, Generic, List, Iterable, overload, Any

import pyarrow as pa
from lithops.storage import Storage
from lithops.storage.utils import CloudObject

logger = logging.getLogger('annotation-pipeline')
TItem = TypeVar('TItem')
TArg = TypeVar('TArg')
TRet = TypeVar('TRet')


class CObj(Generic[TItem], CloudObject):
    """
    Wrapper type to allow CloudObjects to keep track of the type of their serialized contents.
    Ideally this, along with some serialization/deserialization logic, should be upstreamed into
    Lithops. e.g. add alternatives Storage.save_cobject/Storage.load_object that handle instances,
    in contrast to Storage.get_cobject/Storage.put_cobject to handle bytes/streams.
    """

    def __init__(self, backend, bucket, key):
        CloudObject.__init__(self, backend, bucket, key)


def serialize_to_file(obj, path):
    with open(path, 'wb') as file:
        file.write(pa.serialize(obj).to_buffer())


def deserialize_from_file(path):
    with open(path, 'rb') as file:
        data = pa.deserialize(file.read())
    return data


def serialize(obj):
    try:
        return pa.serialize(obj).to_buffer().to_pybytes()
    except pa.lib.SerializationCallbackError:
        return pickle.dumps(obj)


def deserialize(data):
    try:
        return pa.deserialize(data)
    except pa.lib.ArrowInvalid:
        return pickle.loads(data)


def save_cobj(storage: Storage, obj: TItem, bucket: str = None, key: str = None) -> CObj[TItem]:
    return storage.put_cobject(serialize(obj), bucket, key)


@overload
def load_cobj(storage: Storage, cobj: CObj[TItem]) -> TItem:
    ...


@overload
def load_cobj(storage: Storage, cobj: CloudObject):
    ...


def load_cobj(storage: Storage, cobj):
    return deserialize(storage.get_cobject(cobj))


def save_cobjs(storage: Storage, objs: Iterable[TItem]) -> List[CObj[TItem]]:
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda obj: save_cobj(storage, obj), objs))


@overload
def load_cobjs(storage: Storage, cobjs: Iterable[CObj[TItem]]) -> List[TItem]:
    ...


@overload
def load_cobjs(storage: Storage, cobjs: Iterable[CloudObject]) -> List[Any]:
    ...


def load_cobjs(storage: Storage, cobjs):
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda cobj: load_cobj(storage, cobj), cobjs))


def delete_objects_by_prefix(storage: Storage, bucket: str, prefix: str):
    keys = storage.list_keys(bucket, prefix)
    storage.delete_objects(bucket, keys)
    logger.info(f'Removed {len(keys)} objects from {storage.backend}://{bucket}/{prefix}')


def _iter_with_prefetch(callback, items, prefetch):
    futures: List[Future] = []
    items_iter = iter(items)
    # Limit to a single background thread for prefetching to avoid competing with the main thread,
    # and prevent slow starts caused by resource contention while the first few items are still
    # being processed.
    with ThreadPoolExecutor(1) as executor:
        try:
            while True:
                while len(futures) < prefetch + 1:
                    futures.append(executor.submit(callback, next(items_iter)))
                yield futures.pop(0).result()
        except StopIteration:
            while len(futures) > 0:
                yield futures.pop(0).result()


def iter_cobjects_with_prefetch(
    storage: Storage, cobjects: List[CloudObject], prefetch=1
) -> Iterable[bytes]:
    """Lazily loads the raw content of each item in a list of CloudObjects, prefetching up to
    `prefetch` items ahead."""
    return _iter_with_prefetch(storage.get_cobject, cobjects, prefetch)


def iter_cobjs_with_prefetch(
    storage: Storage, cobjs: List[CObj[TItem]], prefetch=1
) -> Iterable[TItem]:
    """Lazily loads and deserializes each item in a list of CObjs, prefetching up to
    `prefetch` items ahead."""

    return _iter_with_prefetch(lambda cobj: load_cobj(storage, cobj), cobjs, prefetch)
