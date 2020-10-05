from lithops import FunctionExecutor
from lithops.storage.utils import CloudObject, StorageNoSuchKeyError

from sm.engine.annotation_lithops.io import serialise, deserialise, delete_objects_by_prefix


class PipelineCacher:
    def __init__(self, fexec: FunctionExecutor, namespace: str, ds_name: str, db_name: str):
        self.fexec = fexec
        self.config = self.fexec.config
        self.storage = self.fexec.storage

        self.bucket = self.config['pywren']['storage_bucket']
        self.prefixes = {
            '': f'metabolomics/cache/{namespace}',
            ':ds': f'metabolomics/cache/{namespace}/{ds_name}/',
            ':db': f'metabolomics/cache/{namespace}/{db_name}/',
            ':ds/:db': f'metabolomics/cache/{namespace}/{ds_name}/{db_name}/',
        }

    def resolve_key(self, key):
        parts = key.rsplit('/', maxsplit=1)
        if len(parts) == 1:
            return self.prefixes[''] + parts[0]
        else:
            prefix, suffix = parts
            return self.prefixes[prefix] + suffix

    def load(self, key):
        data_stream = self.storage.get_object(bucket=self.bucket, key=self.resolve_key(key))
        return deserialise(data_stream)

    def save(self, data, key):
        self.storage.put_object(self.bucket, self.resolve_key(key), serialise(data))

    def exists(self, key):
        try:
            self.storage.head_object(self.bucket, self.resolve_key(key))
            return True
        except StorageNoSuchKeyError:
            return False

    def clean(self, database=True, dataset=True, hard=False):
        unique_prefixes = []
        if not hard:
            if database:
                unique_prefixes.append(self.prefixes[':db'])
            if dataset:
                unique_prefixes.append(self.prefixes[':ds'])
            if database or dataset:
                unique_prefixes.append(self.prefixes[':ds/:db'])
        else:
            unique_prefixes.append(self.prefixes[''])

        keys = [
            key for prefix in unique_prefixes for key in self.storage.list_keys(self.bucket, prefix)
        ]

        cobjects_to_clean = []
        for cache_key in keys:
            cache_data = deserialise(self.storage.get_object(self.bucket, cache_key))

            if isinstance(cache_data, tuple):
                for obj in cache_data:
                    if isinstance(obj, list):
                        if isinstance(obj[0], CloudObject):
                            cobjects_to_clean.extend(obj)
                    elif isinstance(obj, CloudObject):
                        cobjects_to_clean.append(obj)
            elif isinstance(cache_data, list):
                if isinstance(cache_data[0], CloudObject):
                    cobjects_to_clean.extend(cache_data)
            elif isinstance(cache_data, CloudObject):
                cobjects_to_clean.append(cache_data)

        self.fexec.clean(cs=cobjects_to_clean)
        for prefix in unique_prefixes:
            delete_objects_by_prefix(self.storage, self.bucket, prefix)
