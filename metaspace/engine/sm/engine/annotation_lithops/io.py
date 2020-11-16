from __future__ import annotations

import logging
import pickle
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TypeVar, Generic, List, Iterable

import numpy as np
import pyarrow as pa
from lithops.storage import Storage
from lithops.storage.utils import CloudObject

logger = logging.getLogger('annotation-pipeline')
T = TypeVar('T')


class CObj(Generic[T], CloudObject):
    """
    Wrapper type to allow CloudObjects to keep track of the type of their serialized contents.
    Ideally this, along with some serialization/deserialization logic, should be upstreamed into
    Lithops. e.g. add alternatives Storage.save_cobject/Storage.load_object that handle instances,
    in contrast to Storage.get_cobject/Storage.put_cobject to handle bytes/streams.
    """

    def __init__(self, backend, bucket, key):
        CloudObject.__init__(self, backend, bucket, key)


def serialise_to_file(obj, path):
    with open(path, 'wb') as file:
        file.write(pa.serialize(obj).to_buffer())


def deserialise_from_file(path):
    with open(path, 'rb') as file:
        data = pa.deserialize(file.read())
    return data


def serialise(obj):
    try:
        return pa.serialize(obj).to_buffer().to_pybytes()
    except pa.lib.SerializationCallbackError:
        return pickle.dumps(obj)


def deserialise(data):
    try:
        return pa.deserialize(data)
    except pa.lib.ArrowInvalid:
        return pickle.loads(data)


def save_cobj(storage: Storage, obj: T, bucket: str = None, key: str = None) -> CObj[T]:
    return storage.put_cobject(serialise(obj), bucket, key)


def load_cobj(storage: Storage, cobj: CObj[T]) -> T:
    return deserialise(storage.get_cobject(cobj))


def save_cobjs(storage: Storage, objs: Iterable[T]) -> List[CObj[T]]:
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda obj: save_cobj(storage, obj), objs))


def load_cobjs(storage: Storage, cobjs: Iterable[CObj[T]]) -> List[T]:
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda cobj: load_cobj(storage, cobj), cobjs))


def delete_objects_by_prefix(storage: Storage, bucket: str, prefix: str):
    keys = storage.list_keys(bucket, prefix)
    storage.delete_objects(bucket, keys)
    logger.info(f'Removed {len(keys)} objects from {storage.backend}://{bucket}/{prefix}')


def iter_cobjs_with_prefetch(storage: Storage, cobjs: List[CObj[T]], prefetch=1) -> Iterable[T]:
    cobjs = list(cobjs)
    futures: List[Future] = []
    if len(cobjs) == 0:
        return
    with ThreadPoolExecutor(1) as executor:
        while len(futures) or len(cobjs):
            while len(cobjs) and len(futures) < prefetch + 1:
                futures.append(executor.submit(load_cobj, storage, cobjs.pop(0)))
            yield futures.pop(0).result()
