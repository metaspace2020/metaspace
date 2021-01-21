import argparse
import shutil
from pathlib import Path
import time

import numpy as np
from matplotlib import pyplot as plt

from sm.browser import utils, mz_search, split_sort

TMP_LOCAL_PATH = Path("/tmp/imzml-browser")
TMP_LOCAL_PATH.mkdir(parents=True, exist_ok=True)


def log(start, message):
    elapsed = time.time() - start
    print(f"{elapsed:.2f}s: {message}")


def preprocess_dataset_peaks(full_dataset_s3_path: str):
    assert full_dataset_s3_path.startswith("s3")

    start = time.time()
    log(start, "Initialization")
    ds = utils.DatasetFiles(full_dataset_s3_path, TMP_LOCAL_PATH)

    log(start, f"downloading dataset files from {full_dataset_s3_path} to {ds.ds_path}")
    ds.download_imzml()

    log(start, f"parsing imzml at {ds.imzml_path}")
    imzml_reader = split_sort.ImzMLReader(ds.imzml_path)  # replace with ImzmlParser
    imzml_reader.add_stream(ds.ibd_path.open("rb"))

    log(start, f"segmenting dataset by mz at {ds.segments_path}")
    ibd_size_mb = ds.ibd_path.stat().st_size / 1024 ** 2
    split_sort.segment_dataset(imzml_reader, ibd_size_mb, ds.segments_path)

    log(start, f"sorting, merging, saving segments at {ds.sorted_peaks_path}")
    split_sort.sort_merge_segments(ds.segments_path, ds.sorted_peaks_path)

    log(start, f"saving dataset coordinates at {ds.ds_coordinates_path}")
    np.array(imzml_reader.coordinates, dtype="i").tofile(ds.ds_coordinates_path.open("wb"))

    log(start, f"building and saving mz index at {ds.mz_index_path}")
    mz_index = mz_search.build_mz_index(ds.sorted_peaks_path)
    mz_index.tofile(ds.mz_index_path)

    log(start, f"uploading dataset files from {ds.ds_path} to {ds.full_ds_s3_path}")
    ds.upload_sorted_mz()

    log(start, f"removing {ds.segments_path}")
    shutil.rmtree(ds.segments_path, ignore_errors=True)

    log(start, f"done")


class DatasetBrowser:
    def __init__(
        self, full_dataset_s3_path: str,
    ):
        start = time.time()
        log(start, f"fetching and initializing mz index files from {full_dataset_s3_path}")
        ds = utils.DatasetFiles(full_dataset_s3_path, TMP_LOCAL_PATH)
        self.coordinates = np.frombuffer(ds.read_coordinates(), dtype="i").reshape(-1, 2)
        self.mz_index = np.frombuffer(ds.read_mz_index(), dtype="f")
        self.sorted_peaks_s3_file = ds.make_sorted_peaks_s3_file()
        log(start, f"done")

    def search(self, mz_lo: int, mz_hi: int) -> np.ndarray:
        start = time.time()
        log(start, "searching mz image")
        mz_peaks = mz_search.search_and_fetch_mz_peaks(
            self.sorted_peaks_s3_file, self.mz_index, mz_lo, mz_hi
        )
        mz_image, alpha = mz_search.create_mz_image(mz_peaks, self.coordinates)
        rgba_image = plt.get_cmap("viridis")(mz_image)
        rgba_image[:, :, 3] = alpha
        log(start, "done")
        return rgba_image


if __name__ == "__main__":
    parser = argparse.ArgumentParser("Build mz search index and search random mz images")
    parser.add_argument("--s3-path", type=str, required=True)
    parser.add_argument("--sort-peaks", action="store_true")
    parser.add_argument("--mz-search", action="store_true")
    parser.add_argument("--mz", type=float)
    parser.add_argument("--ppm", type=int)
    args = parser.parse_args()

    if args.sort_peaks:
        preprocess_dataset_peaks(args.s3_path)
    elif args.mz_search:
        dataset_browser = DatasetBrowser(args.s3_path)
        mz_lo, mz_hi = utils.mz_ppm_bin(mz=args.mz, ppm=args.ppm)
        mz_image = dataset_browser.search(mz_lo, mz_hi)

        plt.imshow(mz_image)
        plt.show()
