import pathlib
import struct
from typing import io

import numpy as np
import matplotlib.pyplot as plt

MB = 1024 ** 2
ELEMENT_SIZE = 4
PEAK_ELEMENTS_N = 3
RECORD_SIZE = ELEMENT_SIZE * PEAK_ELEMENTS_N
CHUNK_RECORDS_N = 1024
CHUNK_SIZE = CHUNK_RECORDS_N * RECORD_SIZE


def seek_read_mz(stream, offset):
    stream.seek(offset,)
    bytes = stream.read(ELEMENT_SIZE)
    (mz,) = struct.unpack("<f", bytes)  # little endian
    return mz


def build_mz_index(sorted_peaks_path: pathlib.Path) -> np.ndarray:
    bin_file_size_mb = sorted_peaks_path.stat().st_size
    with sorted_peaks_path.open("rb") as stream:
        mzs = []
        for offset in range(0, bin_file_size_mb, CHUNK_SIZE):
            mz = seek_read_mz(stream, offset)
            mzs.append(mz)

        return np.array(mzs, dtype="f")


class BinaryFile:
    @property
    def size(self) -> int:
        raise NotImplementedError

    def seek(self, offset: int) -> int:
        raise NotImplementedError

    def read(self, n: int) -> bytes:
        raise NotImplementedError


class S3File(BinaryFile):
    def __init__(self, s3_object, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.s3_object = s3_object
        self.position: int = 0

    @property
    def size(self) -> int:
        return self.s3_object.content_length

    def seek(self, offset: int, **kwargs) -> int:
        assert 0 <= offset < self.size, f"0 <= {offset} < {self.size}"

        self.position = offset
        return self.position

    def read(self, n: int) -> bytes:
        assert n > 0

        start, end = self.position, self.position + n - 1  # end included
        if end > self.size - 1:
            end = self.size - 1
        range_header = f"bytes={start}-{end}"
        return self.s3_object.get(Range=range_header)["Body"].read()


def search_and_fetch_mz_peaks(
    stream: BinaryFile, mz_index: np.ndarray, mz_lo: float, mz_hi: float
) -> np.ndarray:
    mz_lo_chunk_idx, mz_hi_chunk_idx = np.searchsorted(mz_index, [mz_lo, mz_hi])
    if mz_hi_chunk_idx == 0:
        return np.zeros((0, 3), dtype="f")

    mz_lo_chunk_idx -= 1  # previous chunk actually includes value

    offset = mz_lo_chunk_idx * CHUNK_SIZE
    stream.seek(offset)
    bytes_to_read = (mz_hi_chunk_idx - mz_lo_chunk_idx + 1) * CHUNK_SIZE
    bytes = stream.read(bytes_to_read)
    mz_chunks_array = np.frombuffer(bytes, dtype="f").reshape(-1, 3)
    idx_lo, idx_hi = np.searchsorted(mz_chunks_array[:, 0], [mz_lo, mz_hi])
    mz_peaks = mz_chunks_array[idx_lo:idx_hi]  # idx_hi equals to index after last

    return mz_peaks


def create_mz_image(mz_peaks: np.ndarray, coordinates: np.ndarray) -> np.ndarray:
    min_x, min_y = np.amin(coordinates, axis=0)
    max_x, max_y = np.amax(coordinates, axis=0)
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1
    mz_image = np.zeros(shape=(nrows, ncols))

    alpha = np.zeros(shape=(nrows, ncols))
    all_xs, all_ys = zip(*coordinates)
    all_xs -= min_x
    all_ys -= min_y
    alpha[all_ys, all_xs] = 1

    # image_coords = coordinates[mz_peaks[:, 2].astype(int)]
    image_coord_idxs = mz_peaks[:, 2].astype("i")
    xs = all_xs[image_coord_idxs]
    ys = all_ys[image_coord_idxs]
    mz_image[ys, xs] += mz_peaks[:, 1]
    if mz_image.sum() > 0:
        mz_image /= mz_image.max()

    cmap = plt.get_cmap("viridis")
    rgba_image = cmap(mz_image)
    rgba_image[:, :, 3] = alpha
    return rgba_image
