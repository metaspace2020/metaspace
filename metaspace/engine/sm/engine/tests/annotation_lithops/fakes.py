"""In-memory storage fakes shared by the cost cap tests."""
from datetime import datetime, timezone
from typing import Dict, List, Optional


class FakeStorage:
    """Dict-backed stand-in for ``lithops.storage.Storage``."""

    def __init__(self, bucket: str = 'fake-bucket'):
        self.bucket = bucket
        self.objects: Dict[str, bytes] = {}
        self.last_modified: Dict[str, datetime] = {}  # test hook; default is "now"
        self.omit_last_modified = False  # test hook: list items without LastModified

    def put_object(self, bucket: str, key: str, body) -> None:
        if isinstance(body, str):
            body = body.encode()
        self.objects[key] = body

    def get_object(self, bucket: str, key: str) -> bytes:
        return self.objects[key]

    def list_keys(self, bucket: str, prefix: str = None) -> List[str]:
        return [k for k in sorted(self.objects) if k.startswith(prefix or '')]

    def list_objects(self, bucket: str, prefix: str = None) -> List[dict]:
        """Like the AWS S3 backend: raw ``Contents`` items."""
        items = []
        for key in self.list_keys(bucket, prefix):
            item = {'Key': key, 'Size': len(self.objects[key])}
            if not self.omit_last_modified:
                item['LastModified'] = self.last_modified.get(key, datetime.now(timezone.utc))
            items.append(item)
        return items

    def head_object(self, bucket: str, key: str) -> dict:
        if key not in self.objects:
            raise KeyError(key)  # Lithops raises when the key is missing
        return {'content-length': len(self.objects[key])}

    def exists(self, key: str) -> bool:
        """Test helper: True if the key is stored."""
        return key in self.objects


class BrokenStorage:
    """Storage whose every call raises."""

    bucket = 'broken-bucket'

    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)

        def fail(*args, **kwargs):
            raise RuntimeError(f'BrokenStorage.{name} called')

        return fail


class CountingStorage(FakeStorage):
    """FakeStorage that counts ``list_objects`` calls in ``list_calls`` and GETs in ``get_calls``."""

    def __init__(self, bucket: str = 'fake-bucket'):
        super().__init__(bucket)
        self.list_calls = 0
        self.get_calls = 0

    def list_objects(self, bucket: str, prefix: Optional[str] = None) -> List[dict]:
        self.list_calls += 1
        return super().list_objects(bucket, prefix)

    def get_object(self, bucket: str, key: str) -> bytes:
        self.get_calls += 1
        return super().get_object(bucket, key)
