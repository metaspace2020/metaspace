import math
import pathlib
from traceback import format_exc
from typing import Optional, io, List

import numpy as np
from pyimzml.ImzMLParser import ImzMLParser

from sm.engine.errors import ImzMLError
from sm.engine.msm_basic import segmenter
from . import utils

MAX_MZ_VALUE = 10 ** 5


class ImzMLReader:
    def __init__(self, imzml_path: pathlib.Path):
        try:
            imzml_parser = ImzMLParser(imzml_path, parse_lib="ElementTree")
            self.spectrum_reader = imzml_parser.portable_spectrum_reader()
            del imzml_parser
        except Exception as e:
            raise ImzMLError(format_exc()) from e
        self._stream = None

    def get_spectrum(self, idx):
        return self.spectrum_reader.read_spectrum_from_file(self._stream, idx)

    @property
    def coordinates(self):
        return np.array(self.spectrum_reader.coordinates)[:, :2]

    @property
    def spectra_n(self):
        return len(self.spectrum_reader.coordinates)

    def add_stream(self, stream: io.BinaryIO):
        self._stream = stream

    def remove_stream(self):
        self._stream.close()
        self._stream = None


def read_spectra_chunk(spectrum_reader: ImzMLReader, chunk_sp_idxs):
    mzs_list, ints_list, idxs_list = [], [], []
    for idx in chunk_sp_idxs:
        mzs, ints = spectrum_reader.get_spectrum(idx)
        mzs, ints = mzs.astype("f"), ints.astype("f")
        mzs_list.append(mzs)
        ints_list.append(ints)
        idxs_list.append(np.ones_like(mzs) * idx)

    chunk_mzs = np.concatenate(mzs_list).astype("f")
    by_mz = np.argsort(chunk_mzs, kind="mergesort")
    return np.stack(
        [
            chunk_mzs[by_mz],
            np.concatenate(ints_list).astype("f")[by_mz],
            np.concatenate(idxs_list).astype("f")[by_mz],
        ]
    ).T.astype("f")


def segment_spectra_chunk(
    spectra_chunk: np.ndarray, segment_bounds: List[List], segments_path: pathlib.Path
):
    segm_left_bounds, segm_right_bounds = zip(*segment_bounds)
    segm_first_idx = np.searchsorted(spectra_chunk[:, 0], segm_left_bounds)
    segm_last_idx = np.searchsorted(spectra_chunk[:, 0], segm_right_bounds)

    for segm_i, (first, last) in enumerate(zip(segm_first_idx, segm_last_idx)):
        segment_path = segments_path / f"segment_{segm_i:04}.bin"
        spectra_chunk_segment = spectra_chunk[first:last]
        print(spectra_chunk_segment.shape)
        spectra_chunk_segment.tofile(segment_path.open("ab"))


def define_segment_bounds(imzml_reader: ImzMLReader, ibd_size_mb: int):
    MB = 1024 ** 2
    BYTES_PER_VALUE = 4
    CHUNK_SIZE_MB = 64
    SEGMENT_SIZE_MB = 1024

    segment_n = math.ceil(ibd_size_mb / SEGMENT_SIZE_MB)

    sample_size = min(10000, imzml_reader.spectra_n)
    sample_mzs = np.concatenate(
        [mzs for _, mzs, _ in segmenter.spectra_sample_gen(imzml_reader, sample_size)]
    )
    peaks_per_spectrum_avg = sample_mzs.shape[0] / sample_size
    spectrum_size_avg_mb = peaks_per_spectrum_avg * 2 * BYTES_PER_VALUE / MB
    spectra_per_chunk = int(CHUNK_SIZE_MB // spectrum_size_avg_mb)

    segment_quantiles = [i * 1 / segment_n for i in range(0, segment_n + 1)]
    bounds = np.quantile(sample_mzs, q=segment_quantiles)
    segment_bounds = [[bounds[i], bounds[i + 1]] for i in range(0, segment_n)]

    # Extend boundaries of the first and last segments
    # to include all mzs outside of the sample spectra mz range
    segment_bounds[0][0] = 0
    segment_bounds[-1][1] = MAX_MZ_VALUE
    return segment_bounds, spectra_per_chunk


def segment_dataset(imzml_reader: ImzMLReader, ibd_size_mb: int, segments_path: pathlib.Path):
    utils.clean_dir(segments_path)

    segment_bounds, spectra_per_chunk = define_segment_bounds(imzml_reader, ibd_size_mb)

    spectrum_idx_chunks = segmenter.chunk_list(
        xs=range(imzml_reader.spectra_n), size=spectra_per_chunk
    )
    for chunk_i, spectrum_idxs in enumerate(spectrum_idx_chunks):
        print(f"Chunk: {chunk_i}, spectra: {len(spectrum_idxs)}")
        spectra_chunk = read_spectra_chunk(imzml_reader, spectrum_idxs)
        segment_spectra_chunk(spectra_chunk, segment_bounds, segments_path)


def sort_segments(segments_path):
    segment_n = sum(1 for _ in segments_path.iterdir())
    for segm_i in range(segment_n):
        print(f"Sorting segment {segm_i}")
        segment_path = segments_path / f"segment_{segm_i:04}.bin"
        segment = np.fromfile(segment_path.open("rb"), dtype="f").reshape(-1, 3)

        by_mz = segment[:, 0].argsort(kind="mergesort")
        segment = segment[by_mz]
        segment.tofile(segment_path.open("wb"))


def sort_merge_segments(segments_path, dataset_bin_path):
    if dataset_bin_path.exists():
        dataset_bin_path.unlink()

    segment_n = sum(1 for _ in segments_path.iterdir())
    for segm_i in range(segment_n):
        print(f"Writing segment {segm_i}")
        segment_path = segments_path / f"segment_{segm_i:04}.bin"
        segment = np.fromfile(segment_path.open("rb"), dtype="f").reshape(-1, 3)

        by_mz = segment[:, 0].argsort(kind="mergesort")
        segment = segment[by_mz]

        segment.tofile(dataset_bin_path.open("ab"))
