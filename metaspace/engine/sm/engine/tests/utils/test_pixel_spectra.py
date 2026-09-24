from types import SimpleNamespace

import numpy as np

from sm.engine.tests.fakes import make_fake_s3 as _make_fake_s3
from sm.engine.utils.pixel_spectra import (
    pixel_indexes_from_reader,
    region_peak_count,
    read_pixel_spectra,
    sort_like_browser,
    COALESCE_GAP_BYTES,
)

BUCKET = 'upload'
IBD_KEY = 'uuid/file.ibd'


def build_processed_ibd(spectra, coords, pad_between=0):
    """spectra: list of (mzs float64 array, ints float32 array). Returns (bytes, reader)."""
    buf = bytearray(b'\x00' * 16)  # UUID header
    mz_offsets, mz_lengths, int_offsets, int_lengths = [], [], [], []
    for mzs, ints in spectra:
        buf.extend(b'\x00' * pad_between)
        mz_offsets.append(len(buf))
        mz_lengths.append(len(mzs))
        buf.extend(np.asarray(mzs, dtype='d').tobytes())
        int_offsets.append(len(buf))
        int_lengths.append(len(ints))
        buf.extend(np.asarray(ints, dtype='f').tobytes())
    reader = SimpleNamespace(
        coordinates=coords,
        mzOffsets=mz_offsets,
        mzLengths=mz_lengths,
        intensityOffsets=int_offsets,
        intensityLengths=int_lengths,
        mzPrecision='d',
        intensityPrecision='f',
    )
    return bytes(buf), reader


def build_continuous_ibd(shared_mzs, ints_per_spectrum, coords):
    buf = bytearray(b'\x00' * 16)
    mz_offset = len(buf)
    buf.extend(np.asarray(shared_mzs, dtype='d').tobytes())
    int_offsets, int_lengths = [], []
    for ints in ints_per_spectrum:
        int_offsets.append(len(buf))
        int_lengths.append(len(ints))
        buf.extend(np.asarray(ints, dtype='f').tobytes())
    reader = SimpleNamespace(
        coordinates=coords,
        mzOffsets=[mz_offset] * len(ints_per_spectrum),
        mzLengths=[len(shared_mzs)] * len(ints_per_spectrum),
        intensityOffsets=int_offsets,
        intensityLengths=int_lengths,
        mzPrecision='d',
        intensityPrecision='f',
    )
    return bytes(buf), reader


COORDS = [(1, 1, 1), (2, 1, 1), (3, 1, 1), (1, 2, 1)]  # imzML 1-based (x, y, z)


def make_fake_s3(data: bytes):
    return _make_fake_s3({IBD_KEY: data})


def test_pixel_indexes_match_imzml_reader_formula():
    _, reader = build_processed_ibd([([1.0], [1.0])] * 4, COORDS)
    # coordinates minus min, w = max_x + 1 = 3, index = y * w + x
    np.testing.assert_array_equal(pixel_indexes_from_reader(reader), [0, 1, 2, 3])


def test_region_peak_count_sums_lengths_over_mask():
    _, reader = build_processed_ibd(
        [([1.0, 2.0], [1, 1]), ([1.0], [1]), ([1.0, 2.0, 3.0], [1, 1, 1]), ([1.0], [1])], COORDS
    )
    mask = np.array([True, False, True, False])
    assert region_peak_count(reader, mask) == 5


def test_read_pixel_spectra_processed_layout_drops_zero_intensities():
    spectra = [
        (np.array([100.5, 200.25]), np.array([1.0, 0.0])),
        (np.array([150.0]), np.array([5.0])),
        (np.array([100.5, 300.0, 400.0]), np.array([2.0, 3.0, 4.0])),
        (np.array([999.0]), np.array([9.0])),
    ]
    data, reader = build_processed_ibd(spectra, COORDS)
    s3 = make_fake_s3(data)

    mzs, ints, pix = read_pixel_spectra(s3, BUCKET, IBD_KEY, reader, np.array([0, 2]))

    np.testing.assert_array_equal(mzs, [100.5, 100.5, 300.0, 400.0])
    assert mzs.dtype == np.float64
    np.testing.assert_array_equal(ints, np.array([1.0, 2.0, 3.0, 4.0], dtype='f'))
    assert ints.dtype == np.float32
    np.testing.assert_array_equal(pix, [0, 2, 2, 2])
    assert pix.dtype == np.int32


def test_adjacent_spectra_are_read_in_one_request():
    spectra = [(np.arange(10.0), np.ones(10, 'f'))] * 4
    data, reader = build_processed_ibd(spectra, COORDS)
    s3 = make_fake_s3(data)

    read_pixel_spectra(s3, BUCKET, IBD_KEY, reader, np.array([0, 1, 2]))

    assert len(s3.ranges) == 1


def test_far_apart_spectra_use_separate_requests():
    spectra = [(np.arange(10.0), np.ones(10, 'f'))] * 4
    data, reader = build_processed_ibd(spectra, COORDS, pad_between=COALESCE_GAP_BYTES + 1)
    s3 = make_fake_s3(data)

    read_pixel_spectra(s3, BUCKET, IBD_KEY, reader, np.array([0, 3]))

    assert len(s3.ranges) == 2


def test_continuous_layout_reads_shared_mz_block_once():
    shared = np.array([100.0, 200.0, 300.0])
    ints = [
        np.array([1, 0, 3], 'f'),
        np.array([4, 5, 6], 'f'),
        np.array([0, 0, 9], 'f'),
        np.array([1, 1, 1], 'f'),
    ]
    data, reader = build_continuous_ibd(shared, ints, COORDS)
    s3 = make_fake_s3(data)

    mzs, out_ints, pix = read_pixel_spectra(s3, BUCKET, IBD_KEY, reader, np.array([0, 1, 2]))

    np.testing.assert_array_equal(mzs, [100.0, 300.0, 100.0, 200.0, 300.0, 300.0])
    np.testing.assert_array_equal(out_ints, [1, 3, 4, 5, 6, 9])
    np.testing.assert_array_equal(pix, [0, 0, 1, 1, 1, 2])
    assert len(s3.ranges) == 1


def test_sort_like_browser_matches_ingestion_order_and_precision():
    rng = np.random.default_rng(1)
    # two float64 values that collapse to the same float32 must keep float64 order
    mzs = np.concatenate([rng.random(50) * 1000, [500.00000001, 500.0]])
    ints = rng.random(52).astype('f')
    pix = rng.integers(0, 5, 52).astype(np.int32)

    out_mzs, out_ints, out_pix = sort_like_browser(mzs, ints, pix)

    order = np.argsort(mzs, kind='mergesort')
    np.testing.assert_array_equal(out_mzs, mzs[order].astype('f'))
    np.testing.assert_array_equal(out_ints, ints[order])
    np.testing.assert_array_equal(out_pix, pix[order])
    assert out_mzs.dtype == np.float32 and out_pix.dtype == np.int32
