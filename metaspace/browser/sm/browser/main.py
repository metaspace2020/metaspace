import argparse
import pathlib
import pickle
import time
from typing import Optional, io

import boto3
import numpy as np
from matplotlib import pyplot as plt

from sm.engine import util as sm_engine_utils
from sm.browser.mz_search import S3File
from . import utils, mz_search, split_sort

TMP_LOCAL_PATH = pathlib.Path("/tmp/dataset-browser")
TMP_LOCAL_PATH.mkdir(parents=True, exist_ok=True)


def log(start, message):
    print(f"{time.time() - start:.2f}s: {message}")


class DatasetBrowser:
    def __init__(self, dataset_s3_path: str):
        self.dataset_s3_path = dataset_s3_path
        bucket_name, self.ds_s3_path = sm_engine_utils.split_s3_path(self.dataset_s3_path)
        ds_name = self.ds_s3_path.split("/")[-1]

        self.ds_local_path: pathlib.Path = TMP_LOCAL_PATH / ds_name
        self.imzml_local_path: pathlib.Path = utils.get_file_by_ext(self.ds_local_path, ".imzml")
        self.ibd_local_path: pathlib.Path = utils.get_file_by_ext(self.ds_local_path, ".ibd")

        self.segments_path: pathlib.Path = self.ds_local_path / "segments"
        self.sorted_peaks_path: pathlib.Path = self.ds_local_path / "peaks_sorted_by_mz.bin"
        self.mz_index_path: pathlib.Path = self.ds_local_path / "mz_index.bin"
        self.imzml_reader_path: pathlib.Path = self.ds_local_path / "imzml_reader.pickle"

        self.ibd_s3_path: str = f"{self.ds_s3_path}/{self.ibd_local_path.name}"
        self.sorted_peaks_s3_path: str = f"{self.ds_s3_path}/{self.sorted_peaks_path.name}"

        session = boto3.Session()
        s3 = session.resource("s3")
        self.bucket = s3.Bucket(bucket_name)

        self.imzml_reader: Optional[split_sort.ImzMLReader] = None
        self.mz_index: Optional[np.ndarray] = None
        self.sorted_peaks_s3_file: Optional[mz_search.BinaryFile] = None

    def build_index(self):
        start = time.time()
        log(start, "Building index:")

        log(start, f"downloading dataset {self.dataset_s3_path} to {self.ds_local_path}")
        utils.download_dataset(self.bucket, self.ds_s3_path, self.ds_local_path)

        log(start, f"parsing imzml in {self.ds_local_path}")
        ibd_stream = self.ibd_local_path.open("rb")
        self.imzml_reader = split_sort.ImzMLReader(self.imzml_local_path)
        self.imzml_reader.add_stream(ibd_stream)

        log(start, f"segmenting and sorting dataset by mz in {self.segments_path}")
        ibd_size_mb = self.ibd_local_path.stat().st_size / 1024 ** 2
        split_sort.segment_dataset(self.imzml_reader, ibd_size_mb, self.segments_path)

        log(start, f"pickling imzml_reader to {self.imzml_reader_path}")
        self.imzml_reader.remove_stream()
        pickle.dump(self.imzml_reader, self.imzml_reader_path.open("wb"))

        log(start, "segmenting and sorting dataset by mz")
        split_sort.merge_segments(self.segments_path, self.sorted_peaks_path)

        log(start, f"building mz index {self.mz_index_path}")
        self.mz_index = mz_search.build_mz_index(self.sorted_peaks_path)
        self.mz_index.tofile(self.mz_index_path)

        log(start, f"uploading imzml_reader {self.imzml_reader_path}")
        self.bucket.upload_file(
            Filename=str(self.imzml_reader_path),
            Key=f"{self.ds_s3_path}/{self.imzml_reader_path.name}",
        )
        log(start, f"uploading sorted peaks {self.sorted_peaks_path}")
        # bucket.upload_file(
        #     Filename=str(self.sorted_peaks_path),
        #     Key=f"{self.ds_path_key}/{self.sorted_peaks_path.name}",
        # )
        log(start, f"uploading mz index {self.mz_index_path}")
        self.bucket.upload_file(
            Filename=str(self.mz_index_path), Key=f"{self.ds_s3_path}/{self.mz_index_path.name}",
        )

        # TODO: remove local files

        log(start, f"done")

    def download_index(self):
        start = time.time()
        log(start, "Downloading index:")

        log(start, f"downloading and initializing imzml_reader {self.imzml_reader_path}")
        # self.bucket.download_file(
        #     Key=f"{self.ds_s3_path}/{self.imzml_reader_path.name}",
        #     Filename=str(self.imzml_reader_path),
        # )
        self.imzml_reader = pickle.load(self.imzml_reader_path.open("rb"))
        ibd_s3_file = S3File(self.bucket.Object(key=self.ibd_s3_path))
        self.imzml_reader.add_stream(ibd_s3_file)

        log(start, f"downloading and initializing mz_index {self.mz_index_path}")
        # self.bucket.download_file(
        #     Key=f"{self.ds_s3_path}/{self.imzml_reader_path.name}",
        #     Filename=str(self.imzml_reader_path),
        # )
        self.mz_index = np.fromfile(self.mz_index_path, dtype="f")

        self.sorted_peaks_s3_file = S3File(self.bucket.Object(key=self.sorted_peaks_s3_path))

    def search_mz(self, mz_lo: int, mz_hi: int):
        assert not (
            self.imzml_reader is None or self.mz_index is None or self.sorted_peaks_s3_file is None
        )

        mz_peaks = mz_search.search_and_fetch_mz_peaks(
            self.sorted_peaks_s3_file, self.mz_index, mz_lo, mz_hi
        )
        mz_image = mz_search.create_mz_image(mz_peaks, self.imzml_reader.coordinates)
        return mz_image


if __name__ == "__main__":
    parser = argparse.ArgumentParser("Build mz search index and search random mz images")
    parser.add_argument("--s3-path", type=str, required=True)
    parser.add_argument("--build-index", action="store_true")
    parser.add_argument("--mz-search", action="store_true")
    parser.add_argument("--mz", type=float)
    parser.add_argument("--ppm", type=int)
    args = parser.parse_args()

    if args.build_index:
        dataset_browser = DatasetBrowser(args.s3_path)
        dataset_browser.build_index()
    elif args.mz_search:
        dataset_browser = DatasetBrowser(args.s3_path)
        dataset_browser.download_index()
        mz_lo, mz_hi = utils.mz_ppm_bin(mz=args.mz, ppm=args.ppm)
        mz_image = dataset_browser.search_mz(mz_lo, mz_hi)
        # plt.imshow(mz_image)
        # plt.show()
