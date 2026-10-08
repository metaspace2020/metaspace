from unittest.mock import MagicMock

import numpy as np
import pytest

from sm.engine.tests.fakes import make_fake_s3
from sm.engine.utils.browser_arrays import BrowserArrays, INDEX_STEP, browser_arrays_for_dataset

UUID = 'the-uuid'


def make_arrays(n, seed=0):
    rng = np.random.default_rng(seed)
    # choice from a small grid guarantees duplicated m/z values
    mzs = np.sort(rng.choice(np.linspace(100, 1000, max(3, n // 3)), size=n)).astype('f')
    ints = rng.random(n).astype('f')
    sp_idxs = rng.integers(0, 50, n).astype('f')
    files = {
        f'{UUID}/mzs.npy': mzs.tobytes(),
        f'{UUID}/ints.npy': ints.tobytes(),
        f'{UUID}/sp_idxs.npy': sp_idxs.tobytes(),
        f'{UUID}/mz_index.npy': mzs[::INDEX_STEP].tobytes(),
    }
    return mzs, ints, sp_idxs, files


def test_peak_count_from_head_object():
    _, _, _, files = make_arrays(5000)
    arrays = BrowserArrays(make_fake_s3(files), 'bucket', UUID)
    assert arrays.peak_count() == 5000


def test_iter_chunks_reassembles_all_three_arrays():
    mzs, ints, sp_idxs, files = make_arrays(5000)
    s3 = make_fake_s3(files)
    arrays = BrowserArrays(s3, 'bucket', UUID)

    parts = list(arrays.iter_chunks(chunk_bytes=700))

    np.testing.assert_array_equal(np.concatenate([p[0] for p in parts]), mzs)
    np.testing.assert_array_equal(np.concatenate([p[1] for p in parts]), ints)
    np.testing.assert_array_equal(np.concatenate([p[2] for p in parts]), sp_idxs)
    assert max(s3.request_sizes) <= 700


@pytest.mark.parametrize('chunk_bytes', [4 * 1024, 4 * 3000, 10 ** 9])
def test_iter_mz_windows_matches_full_array_searchsorted(chunk_bytes):
    mzs, ints, sp_idxs, files = make_arrays(5000)
    dup = float(mzs[123])
    lo_b = np.array([mzs[0] - 1, dup, 500.0, mzs[-1], 2000.0, 400.0, 300.0], dtype=np.float64)
    hi_b = np.array([mzs[0], dup, 500.5, mzs[-1] + 1, 3000.0, 400.0001, 900.0], dtype=np.float64)
    arrays = BrowserArrays(make_fake_s3(files), 'bucket', UUID)

    out = {
        i: (m, n, s) for i, m, n, s in arrays.iter_mz_windows(lo_b, hi_b, chunk_bytes=chunk_bytes)
    }

    assert sorted(out) == list(range(len(lo_b)))
    for i, _ in enumerate(lo_b):
        left = np.searchsorted(mzs, lo_b[i], side='left')
        right = np.searchsorted(mzs, hi_b[i], side='right')
        np.testing.assert_array_equal(out[i][0], mzs[left:right])
        np.testing.assert_array_equal(out[i][1], ints[left:right])
        np.testing.assert_array_equal(out[i][2], sp_idxs[left:right])


def test_dense_windows_stream_in_bounded_requests():
    _, _, _, files = make_arrays(20000)
    s3 = make_fake_s3(files)
    arrays = BrowserArrays(s3, 'bucket', UUID)
    lo_b = np.linspace(100, 999, 500)
    hi_b = lo_b + 0.5

    list(arrays.iter_mz_windows(lo_b, hi_b, chunk_bytes=8192))

    data_requests = [s for s in s3.request_sizes if s != len(files[f'{UUID}/mz_index.npy'])]
    assert max(data_requests) <= 8192


def test_sparse_windows_read_far_less_than_the_file():
    _, _, _, files = make_arrays(20000)
    s3 = make_fake_s3(files)
    arrays = BrowserArrays(s3, 'bucket', UUID)

    list(arrays.iter_mz_windows(np.array([250.0]), np.array([250.001]), chunk_bytes=8192))

    assert sum(s3.request_sizes) < len(files[f'{UUID}/mzs.npy'])


def test_window_larger_than_chunk_is_returned_whole():
    mzs, _, _, files = make_arrays(20000)
    arrays = BrowserArrays(make_fake_s3(files), 'bucket', UUID)

    ((_, out_mzs, _, _),) = list(
        arrays.iter_mz_windows(np.array([0.0]), np.array([5000.0]), chunk_bytes=4096)
    )

    np.testing.assert_array_equal(out_mzs, mzs)


def test_browser_arrays_for_dataset_resolves_uuid_and_bucket():
    db = MagicMock()
    db.select_one.return_value = ('s3://upload-bucket/path/the-uuid',)
    arrays = browser_arrays_for_dataset(
        db, MagicMock(), {'imzml_browser_storage': {'bucket': 'b'}}, 'ds'
    )
    assert (arrays.bucket, arrays.uuid) == ('b', 'the-uuid')

    db.select_one.return_value = None
    with pytest.raises(ValueError):
        browser_arrays_for_dataset(
            db, MagicMock(), {'imzml_browser_storage': {'bucket': 'b'}}, 'ds'
        )


def test_iter_mz_windows_is_independent_of_worker_count():
    mzs, _, _, files = make_arrays(20000)
    lo_b = np.linspace(100, 999, 50)
    hi_b = lo_b + 0.3
    serial = BrowserArrays(make_fake_s3(files), 'bucket', UUID)
    parallel = BrowserArrays(make_fake_s3(files), 'bucket', UUID)

    out_serial = {i: m for i, m, _, _ in serial.iter_mz_windows(lo_b, hi_b, 8192, workers=1)}
    out_parallel = {i: m for i, m, _, _ in parallel.iter_mz_windows(lo_b, hi_b, 8192, workers=4)}

    assert sorted(out_serial) == sorted(out_parallel) == list(range(50))
    for i in range(50):
        np.testing.assert_array_equal(out_serial[i], out_parallel[i])
        left, right = np.searchsorted(mzs, [lo_b[i], hi_b[i]], side='left')[0], np.searchsorted(
            mzs, hi_b[i], side='right'
        )
        np.testing.assert_array_equal(out_serial[i], mzs[left:right])
