from __future__ import annotations

import logging
from functools import wraps
from typing import Optional

from lithops.storage import Storage
from lithops.storage.utils import CloudObject, StorageNoSuchKeyError

from sm.engine.annotation_lithops.io import serialize, deserialize, delete_objects_by_prefix

logger = logging.getLogger('annotation-pipeline')


class PipelineCacher:
    def __init__(self, storage: Storage, namespace: str, lithops_config):
        self.storage = storage

        self.bucket, self.root_prefix = lithops_config['sm_storage']['pipeline_cache']
        self.prefix = f'{self.root_prefix}/{namespace}'

    def resolve_key(self, key):
        return f'{self.prefix}/{key}.cache'

    def load(self, key):
        data_stream = self.storage.get_object(self.bucket, self.resolve_key(key))
        return deserialize(data_stream)

    def save(self, data, key):
        self.storage.put_object(self.bucket, self.resolve_key(key), serialize(data))

    def exists(self, key):
        try:
            self.storage.head_object(self.bucket, self.resolve_key(key))
            return True
        except StorageNoSuchKeyError:
            return False

    def clean(self, all_namespaces=False):
        prefix = self.root_prefix if all_namespaces else self.prefix
        keys = self.storage.list_keys(self.bucket, prefix)

        cobjects_to_clean = []
        for cache_key in keys:
            cache_data = deserialize(self.storage.get_object(self.bucket, cache_key))

            if isinstance(cache_data, tuple):
                for obj in cache_data:
                    if isinstance(obj, list) and len(obj) > 0:
                        if isinstance(obj[0], CloudObject):
                            cobjects_to_clean.extend(obj)
                    elif isinstance(obj, CloudObject):
                        cobjects_to_clean.append(obj)
            elif isinstance(cache_data, list):
                if isinstance(cache_data[0], CloudObject):
                    cobjects_to_clean.extend(cache_data)
            elif isinstance(cache_data, CloudObject):
                cobjects_to_clean.append(cache_data)

        self.storage.delete_cloudobjects(cobjects_to_clean)
        delete_objects_by_prefix(self.storage, self.bucket, prefix)


def use_pipeline_cache(f):
    """Decorator to cache individual pipeline stages in the Pipeline class. It works by tracking
    which class properties change during the first call to the wrapped method, and re-applying those
    property changes instead of calling the wrapped function on subsequent calls.

    Pass the "use_cache=False" kwarg to force the function to be re-run.
    """
    f_name = f.__name__

    @wraps(f)
    def wrapper(self, *args, **kwargs):
        use_cache = kwargs.pop('use_cache', True)
        cacher: Optional[PipelineCacher] = getattr(self, 'cacher')
        if args or kwargs:
            logger.info(f'Unable to cache {f_name} as it has args')
            cacher = None
        if not cacher:
            return f(self, *args, **kwargs)

        if use_cache and cacher.exists(f_name):
            updates, ret = cacher.load(f_name)
            self.__dict__.update(updates)
            logger.debug(f'Loaded {f_name} from cache. Keys: {list(updates.keys())}')
            return ret

        dict_before = self.__dict__.copy()
        ret = f(self, *args, **kwargs)
        updates = dict(
            (k, v)
            for k, v in self.__dict__.items()
            if k not in dict_before or dict_before[k] is not v
        )
        cacher.save((updates, ret), f_name)
        logger.debug(f'Saved {f_name} to cache. Keys: {list(updates.keys())}')
        return ret

    return wrapper
