from __future__ import annotations

import logging
import pickle
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TypeVar, Generic, List, Iterable, overload, Any, Tuple, Union

import numpy as np
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
    in contrast to Storage.get_cloudobject/Storage.put_cloudobject to handle bytes/streams.
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
    except (pa.lib.ArrowInvalid, OSError):
        return pickle.loads(data)


def save_cobj(storage: Storage, obj: TItem, bucket: str = None, key: str = None) -> CObj[TItem]:
    return storage.put_cloudobject(serialize(obj), bucket, key)


@overload
def load_cobj(storage: Storage, cobj: CObj[TItem]) -> TItem:
    ...


@overload
def load_cobj(storage: Storage, cobj: CloudObject):
    ...


def load_cobj(storage: Storage, cobj):
    try:
        return deserialize(storage.get_cloudobject(cobj))
    except Exception:
        logger.error(f'Failed to deserialize {cobj}')
        raise


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
    return _iter_with_prefetch(storage.get_cloudobject, cobjects, prefetch)


def iter_cobjs_with_prefetch(
    storage: Storage, cobjs: List[CObj[TItem]], prefetch=1
) -> Iterable[TItem]:
    """Lazily loads and deserializes each item in a list of CObjs, prefetching up to
    `prefetch` items ahead."""

    return _iter_with_prefetch(lambda cobj: load_cobj(storage, cobj), cobjs, prefetch)


def get_ranges_from_cobject(
    storage: Storage, cobj: CloudObject, ranges: Union[List[Tuple[int, int]], np.ndarray]
) -> List[bytes]:
    """Download partial ranges from a CloudObject. This combines adjacent/overlapping ranges
    to minimize the number of requests without wasting any bandwidth if there are large gaps
    between requested ranges."""
    max_jump = 2 ** 16  # Largest gap between ranges before a new request should be made
    # Limit chunks to 256MB to avoid large memory allocations, and because SSL fails if requests
    # are >2GB https://bugs.python.org/issue42853 (Fixed in Python 3.9.7, broken in 3.8.*)
    max_chunk_size = 256 * 2 ** 20

    request_ranges: List[Tuple[int, int]] = []
    tasks = []
    range_start = None
    range_end = None
    for input_i in np.argsort(np.array(ranges)[:, 0]):
        lo_idx, hi_idx = ranges[input_i]
        if range_start is None:
            range_start, range_end = lo_idx, hi_idx
        elif lo_idx - range_end <= max_jump and range_end - range_start <= max_chunk_size:
            range_end = max(range_end, hi_idx)
        else:
            request_ranges.append((range_start, range_end))
            range_start, range_end = lo_idx, hi_idx

        tasks.append((input_i, len(request_ranges), lo_idx - range_start, hi_idx - range_start))

    if range_start is not None and range_end is not None:
        request_ranges.append((range_start, range_end))  # type: ignore

    logger.debug(f'Reading {len(request_ranges)} ranges: {request_ranges}')

    with ThreadPoolExecutor() as executor:

        def get_range(lo_hi):
            lo_idx, hi_idx = lo_hi
            args = {'Range': f'bytes={lo_idx}-{hi_idx-1}'}
            return storage.get_object(cobj.bucket, cobj.key, extra_get_args=args)

        request_results = list(executor.map(get_range, request_ranges))

    return [
        request_results[request_i][request_lo:request_hi]
        for input_i, request_i, request_lo, request_hi in sorted(tasks)
    ]
