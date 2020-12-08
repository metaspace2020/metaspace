import pathlib
import shutil

import boto3

from sm.browser import utils

#
# INIT boto3
#

session = boto3.Session()
s3 = session.resource("s3")
# credentials = session.get_credentials()
# credentials.access_key, credentials.secret_key
# list(s3.buckets.all())
PROD_UPLOAD_BUCKET = s3.Bucket("sm-engine-upload")

#
# DOWNLOAD DATASET
#

data_path = pathlib.Path("/opt/data/imzmls/")
# ds_name = "29052019_MZ_1st_spotting_DAN_mz140-800_neg_pix_150X150"
ds_name = "20200228_366x629_30um_Mouse_Obesity_16w_DAN_Neg_mode_190-2000mz_70K_Laser37_6"
ds_path = data_path / ds_name
# key_prefix = "aaee3eef-d86d-4d3a-9a2d-9f0007ac48ac"
key_prefix = "9066decd-ae93-44d1-9f5c-b0b378a4a8d6"
utils.download_dataset(PROD_UPLOAD_BUCKET, key_prefix, ds_path)

#
# PARSE imzML FILE
#

import numpy as np
from math import ceil

from sm.engine import imzml_parser

imzml_path = utils.get_file_by_ext(ds_path, "imzml")
ibd_path = utils.get_file_by_ext(ds_path, "ibd")
print(f"Parsing imzml in {ds_path}")
imzml_parser = imzml_parser.ImzMLParserWrapper(ds_path)
# spectrum_n = len(imzml_parser.coordinates)
# spectrum_n, imzml_parser.mz_precision


# segments_path = ds_path / "chunks"
# segments_path.mkdir(exist_ok=True)
# chunk_size = 10000
# chunk_n = ceil(len(imzml_parser.coordinates) / chunk_size)
# %time sort_dataset_chunks(chunk_n, chunk_size)

#
# Merge sort 2
#
sorted_mzs_path = ds_path / "sorted.bin"
# %time merge2()

a = np.fromfile(sorted_mzs_path, dtype='f')
np.all(a == np.sort(a))

#
# Merge sort 3
#
# chunk_path = sorted_chunks_path / f"chunk-0.bin"
# chunk_path.stat().st_size / 1024**2

sorted_mzs_path = ds_path / "sorted.bin"
# %time merge3()

# chunk_path = sorted_chunks_path / f"chunk-1.bin"
# a = np.fromfile(chunk_path, dtype='f').reshape(-1, 3)
# n = chunk_path.stat().st_size // BYTES_PER_RECORD
# a = np.memmap(chunk_path, mode="r+", dtype="f", shape=(n, 3))

#
# SPLIT SORT
#

import pickle
from sm.engine.msm_basic import segmenter
from sm.browser import split_sort


segments_path = ds_path / "segments"
split_sort.segment_dataset(imzml_parser, ibd_path, segments_path)
# %time split_sort.segment_dataset(imzml_parser, ibd_path, segments_path)

# segm_i = 0
# segment_path = segments_path / f"segment_{segm_i:04}.bin"
# array = np.fromfile(segment_path.open("rb"), dtype="f").reshape(-1, 3)
# array.shape
# for i in range(3):
#     print(array[:, i].min(), array[:, i].max())


# %time sort_segments(segments_path)
# a = np.fromfile(segment_path.open("rb"), dtype="f").reshape(-1, 3)
# np.all(a[:-1, 0] <= a[1:, 0])

dataset_bin_path = ds_path / "sorted.bin"
split_sort.sort_merge_segments(dataset_bin_path)
# %time merge_segments(dataset_bin_path)

#
# MZ FILE SEARCH
#
import math
import struct

from sm.browser import mz_search

segments_path = ds_path / "segments"

segm_i = 0
segment_path = segments_path / f"segment_{segm_i:04}.bin"

mz_index = mz_search.build_mz_index(segment_path)
len(mz_index), mz_index.max(), mz_index.nbytes / 1024 ** 2

mz = 231.0927
ppm = 3
mz_lo, mz_hi = mz - mz * ppm * 1e-6, mz + mz * ppm * 1e-6

stream = segment_path.open("rb")
mz_peaks = mz_search.search_and_fetch_mz_peaks(stream, mz_index, mz_lo, mz_hi)
stream.close()
mz_lo, mz_hi
mz_peaks.shape

mz_image = mz_search.create_mz_image(mz_peaks, np.array(imzml_parser.coordinates))
# %time _ = mz_search.create_mz_image(mz_peaks, np.array(imzml_parser.coordinates))

from matplotlib import pyplot as plt

plt.imshow(mz_image)
plt.show()

#
# MZ FILE SEARCH ON S3
#
import io
import boto3
from sm.engine import util as sm_engine_utils
from sm.browser import mz_search

s3 = boto3.resource("s3")
list(s3.buckets.all())

s3_path = (
    "s3://sm-engine-dev/dataset-browser/"
    "20200228_366x629_30um_Mouse_Obesity_16w_DAN_Neg_mode_190-2000mz_70K_Laser37_6/"
    "segment_0000.bin"
)
bucket_name, key = sm_engine_utils.split_s3_path(s3_path)
mz_bin_object = s3.Object(bucket_name=bucket_name, key=key)
type(mz_bin_object), mz_bin_object.content_length
# %time _ = mz_bin_object.content_length

s3_file = mz_search.S3File(mz_bin_object)
# s3_file.seek(0)
# bytes = s3_file.read(12)
# # %time bytes = s3_file.read(12)
# mz_chunks_array = np.frombuffer(bytes, dtype="f").reshape(-1, 3)

mz = 231.0927
ppm = 3
mz_lo, mz_hi = mz - mz * ppm * 1e-6, mz + mz * ppm * 1e-6

import random


def search_random_mz():
    rand_mz = 200 + random.random() * 20
    ppm = 3
    mz_lo, mz_hi = rand_mz - rand_mz * ppm * 1e-6, rand_mz + rand_mz * ppm * 1e-6
    mz_peaks = mz_search.search_and_fetch_mz_peaks(s3_file, mz_index, mz_lo, mz_hi)
    mz_image = mz_search.create_mz_image(mz_peaks, np.array(imzml_parser.coordinates))


# %timeit search_random_mz()
# %time mz_peaks = mz_search.search_and_fetch_mz_peaks(s3_file, mz_index, mz_lo, mz_hi)

mz_peaks = mz_search.search_and_fetch_mz_peaks(s3_file, mz_index, mz_lo, mz_hi)
mz_peaks.shape, mz_peaks.nbytes / mz_search.MB
mz_image = mz_search.create_mz_image(mz_peaks, np.array(imzml_parser.coordinates))
plt.imshow(mz_image)
plt.show()


#
# DATASET BROWSER
#

import pickle
from sm.browser.main import DatasetBrowser
from sm.browser import utils, mz_search

dataset_s3_path = "s3://sm-engine-dev/dataset-browser/untreated"

dataset_browser = DatasetBrowser(dataset_s3_path)
dataset_browser.build_index()
del dataset_browser

dataset_browser = DatasetBrowser(dataset_s3_path)
# dataset_browser.imzml_reader.get_spectrum(0)
# dataset_browser.sorted_peaks_s3_file

mz_lo, mz_hi = utils.mz_ppm_bin(mz=772.5123, ppm=3)
mz_image = dataset_browser.search_mz(mz_lo, mz_hi)
# %time mz_image = dataset_browser.search_mz(mz_lo, mz_hi)
plt.imshow(mz_image)
plt.show()
