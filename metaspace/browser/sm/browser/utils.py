import re
import shutil
from pathlib import Path
from typing import Optional
from functools import wraps
from time import time

import boto3

from sm.browser.mz_search import S3File


def list_file_sizes(bucket, max_size_mb=5120):
    obj_sizes = {}
    i = 0
    for obj in bucket.objects.all():
        obj_sizes[obj.key] = obj.size
        i += 1
        if i % 1000:
            print(f"{i} objects")

    obj_sizes = sorted(obj_sizes.items(), key=lambda kv: kv[1], reverse=True)
    obj_sizes_limited = [(key, size) for key, size in obj_sizes if size < max_size_mb * 1024 ** 2]
    for i in range(10):
        key, size = obj_sizes_limited[i]
        print(size / 1024 ** 2, key)


def get_file_by_ext(path: Path, ext: str) -> Optional[Path]:
    for f_path in path.iterdir():
        if f_path.suffix.lower() == ext:
            return f_path


def clean_dir(path):
    shutil.rmtree(path, ignore_errors=True)
    path.mkdir(parents=True, exist_ok=True)


def mz_ppm_bin(mz, ppm):
    return mz - mz * ppm * 1e-6, mz + mz * ppm * 1e-6


def timing(f):
    @wraps(f)
    def wrap(*args, **kw):
        start = time()
        result = f(*args, **kw)
        elapsed = time() - start
        mins, secs = divmod(elapsed, 60)
        print(f"func:{f.__name__} args:[{args}, {kw}] took:{mins:.0f} min {secs:.3f} sec")
        return result

    return wrap


class DatasetFiles:
    def __init__(self, full_ds_s3_path: str, local_dir: Path = "/tmp/dataset-browser"):
        self.full_ds_s3_path = full_ds_s3_path.rstrip("/")
        bucket_name, self.ds_s3_path = re.sub(r"s3?://", "", self.full_ds_s3_path).split("/", 1)
        s3 = boto3.Session().resource("s3")
        self._bucket = s3.Bucket(bucket_name)

        self.ds_name = self.ds_s3_path.split("/")[-1]
        self.ds_path = local_dir / self.ds_name
        self.ds_path.mkdir(exist_ok=True)

        self.segments_path = self.ds_path / "segments"
        self.sorted_peaks_path = self.ds_path / "peaks_sorted_by_mz.bin"
        self.mz_index_path = self.ds_path / "mz_index.bin"
        self.ds_coordinates_path = self.ds_path / "coordinates.bin"

        self.imzml_path: Path = None
        self.ibd_path: Path = None
        self._find_imzml_ibd_name()

    def _find_imzml_ibd_name(self):
        for obj in self._bucket.objects.filter(Prefix=self.ds_s3_path):
            fn = obj.key.split('/')[-1]
            ext = Path(fn).suffix.lower()
            if ext == ".imzml":
                self.imzml_path = self.ds_path / fn
            elif ext == ".ibd":
                self.ibd_path = self.ds_path / fn

    def download_imzml(self):
        for obj in self._bucket.objects.filter(Prefix=self.ds_s3_path):
            fn = obj.key.split('/')[-1]
            if Path(fn).suffix.lower() in [".imzml", ".ibd"]:
                f_path = self.ds_path / fn
                if not f_path.exists():
                    self._bucket.download_file(obj.key, str(f_path))

    def upload_sorted_mz(self):
        self._bucket.upload_file(
            Filename=str(self.ds_coordinates_path),
            Key=f"{self.ds_s3_path}/{self.ds_coordinates_path.name}",
        )
        self._bucket.upload_file(
            Filename=str(self.sorted_peaks_path),
            Key=f"{self.ds_s3_path}/{self.sorted_peaks_path.name}",
        )
        self._bucket.upload_file(
            Filename=str(self.mz_index_path), Key=f"{self.ds_s3_path}/{self.mz_index_path.name}",
        )

    def read_coordinates(self) -> bytes:
        s3_object = self._bucket.Object(key=f"{self.ds_s3_path}/{self.ds_coordinates_path.name}")
        return s3_object.get()["Body"].read()

    def read_mz_index(self) -> bytes:
        s3_object = self._bucket.Object(key=f"{self.ds_s3_path}/{self.mz_index_path.name}")
        return s3_object.get()["Body"].read()

    def make_sorted_peaks_s3_file(self) -> S3File:
        return S3File(self._bucket.Object(key=f"{self.ds_s3_path}/{self.sorted_peaks_path.name}"))
