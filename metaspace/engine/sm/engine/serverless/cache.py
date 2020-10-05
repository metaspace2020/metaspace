from lithops.storage.utils import CloudObject

from sm.engine.serverless.utils import (
    get_ibm_cos_client,
    list_keys,
    clean_from_cos,
    serialise,
    deserialise,
)


class PipelineCacher:
    def __init__(self, pw, namespace, ds_name, db_name):
        self.pywren_executor = pw
        self.config = self.pywren_executor.config

        self.storage_handler = get_ibm_cos_client(self.config)
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
        data_stream = self.storage_handler.get_object(
            Bucket=self.bucket, Key=self.resolve_key(key)
        )['Body']
        return deserialise(data_stream)

    def save(self, data, key):
        self.storage_handler.put_object(
            Bucket=self.bucket, Key=self.resolve_key(key), Body=serialise(data)
        )

    def exists(self, key):
        try:
            self.storage_handler.head_object(Bucket=self.bucket, Key=self.resolve_key(key))
            return True
        except Exception:
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
            key
            for prefix in unique_prefixes
            for key in list_keys(self.bucket, prefix, self.storage_handler)
        ]

        cobjects_to_clean = []
        for cache_key in keys:
            data_stream = self.storage_handler.get_object(Bucket=self.bucket, Key=cache_key)['Body']
            cache_data = deserialise(data_stream)

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

        self.pywren_executor.clean(cs=cobjects_to_clean)
        for prefix in unique_prefixes:
            clean_from_cos(self.config, self.bucket, prefix, self.storage_handler)
