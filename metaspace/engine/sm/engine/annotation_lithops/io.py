from __future__ import annotations

from concurrent.futures._base import Future
from concurrent.futures.thread import ThreadPoolExecutor

import numpy as np
import pickle

from io import BytesIO

import pyarrow as pa
from lithops.storage import Storage
from lithops.storage.utils import CloudObject
from typing import TypeVar, Generic, List, Union, Iterable

from sm.engine.annotation_lithops.utils import logger

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


def save_cobjs(storage: Storage, objs: List[T]) -> List[CObj[T]]:
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda obj: save_cobj(storage, obj), objs))


def load_cobjs(storage: Storage, cobjs: List[CObj[T]]) -> List[T]:
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda cobj: load_cobj(storage, cobj), cobjs))


def read_ranges_from_url(storage, url, ranges):
    """
    Download partial ranges from a file over HTTP/COS. This combines adjacent/overlapping ranges
    to minimize the number of HTTP requests without wasting any bandwidth if there are large gaps
    between requested ranges.
    """
    MAX_JUMP = 2 ** 16  # Largest gap between ranges before a new request should be made

    request_ranges = []
    tasks = []
    range_start = None
    range_end = None
    for input_i in np.argsort(np.array(ranges)[:, 0]):
        lo, hi = ranges[input_i]
        if range_start is None:
            range_start, range_end = lo, hi
        elif lo - range_end <= MAX_JUMP:
            range_end = max(range_end, hi)
        else:
            request_ranges.append((range_start, range_end))
            range_start, range_end = lo, hi

        tasks.append((input_i, len(request_ranges), lo - range_start, hi - range_start))

    if range_start is not None:
        request_ranges.append((range_start, range_end))

    print(f'Reading {len(request_ranges)} ranges: {request_ranges}')

    with ThreadPoolExecutor() as ex:

        def get_range(lo_hi):
            lo, hi = lo_hi
            bucket, key = url[len('cos://') :].split('/', maxsplit=1)
            return storage.get_object(Bucket=bucket, Key=key, Range=f'bytes={lo}-{hi}')[
                'Body'
            ].read()

        request_results = list(ex.map(get_range, request_ranges))

    return [
        request_results[request_i][request_lo:request_hi]
        for input_i, request_i, request_lo, request_hi in sorted(tasks)
    ]


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
