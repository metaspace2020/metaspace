from itertools import product

import numpy as np
import pytest

from sm.engine.annotation_lithops.parallel_sort import get_n_worker_threads, sort_peaks
from sm.engine.utils.perf_profile import SubtaskProfiler


def make_peaks(rng, n_spectra, mz_dtype='d', peaks_lo=50, peaks_hi=400, mz_alphabet=None):
    """Build (mzs, ints, sp_lens, pixel_indexes) shaped like a real imzML read.

    Each spectrum is internally sorted and spectra are laid out back-to-back, which is
    what `_load_spectra` produces. `mz_alphabet` restricts m/z to a small set of values
    to force ties.
    """
    sp_lens = rng.integers(peaks_lo, peaks_hi + 1, n_spectra).astype(np.int64)
    n_peaks = int(sp_lens.sum())

    if mz_alphabet is None:
        mzs = (rng.random(n_peaks) * 1000).astype(mz_dtype)
    else:
        mzs = rng.choice(mz_alphabet, n_peaks).astype(mz_dtype)

    offsets = np.insert(np.cumsum(sp_lens), 0, 0)
    for start, end in zip(offsets[:-1], offsets[1:]):
        mzs[start:end] = np.sort(mzs[start:end])

    ints = (rng.random(n_peaks) * 100).astype(np.float32)
    # Shuffled so that a bug that reconstructs sp_idxs positionally would show up
    pixel_indexes = rng.permutation(n_spectra).astype(np.int64)
    return mzs, ints, sp_lens, pixel_indexes


def reference_sort(mzs, ints, sp_lens, pixel_indexes):
    """The current single-threaded implementation, as the definition of correctness."""
    by_mz = np.argsort(mzs, kind='mergesort')
    sp_idxs = np.repeat(pixel_indexes, sp_lens).astype(np.uint32)
    return mzs[by_mz], ints[by_mz], sp_idxs[by_mz]


def assert_matches_reference(peaks, **kwargs):
    mzs, ints, sp_lens, pixel_indexes = peaks
    exp_mz, exp_int, exp_sp = reference_sort(mzs.copy(), ints.copy(), sp_lens, pixel_indexes)
    # sort_peaks sorts mzs/ints in place, so it must not see the reference's arrays
    got_mz, got_int, got_sp = sort_peaks(
        mzs.copy(), ints.copy(), sp_lens, pixel_indexes, perf=SubtaskProfiler(), **kwargs
    )

    assert np.array_equal(got_mz, exp_mz, equal_nan=True)
    assert np.array_equal(got_int, exp_int)
    assert np.array_equal(got_sp, exp_sp)
    return got_mz, got_int, got_sp


@pytest.mark.parametrize(
    'mz_dtype, n_threads, n_blocks',
    list(product(['f', 'd'], [1, 2, 8], [None, 1, 3, 64])),
)
def test_matches_reference(mz_dtype, n_threads, n_blocks):
    rng = np.random.default_rng(42)
    peaks = make_peaks(rng, 500, mz_dtype=mz_dtype)
    assert_matches_reference(peaks, n_threads=n_threads, n_blocks=n_blocks)


@pytest.mark.parametrize('target_partition_bytes', [1024, 4 * 2 ** 20, 2 ** 30])
def test_partition_size_extremes(target_partition_bytes):
    """Both ends of the partition-count estimate, as the clamps actually leave it.

    Neither end reaches the count the parameter asks for. 1024 bytes works out to ~1000
    partitions, but SAMPLE_STRIDE leaves only ~69 samples to cut on, so `_choose_splitters`
    caps it at ~70. The two larger values both work out to a single partition and are
    both lifted to 16 by the `4 * n_threads` floor - i.e. they are the same code path.
    """
    rng = np.random.default_rng(1)
    peaks = make_peaks(rng, 300)
    assert_matches_reference(peaks, n_threads=4, target_partition_bytes=target_partition_bytes)


def test_stability_when_all_mz_equal():
    """The one case that catches a lost `kind='stable'` or a shuffled block order.

    With every m/z identical the sort has no ordering information to work with, so the
    output must be exactly the input order - i.e. spectrum by spectrum.
    """
    n_spectra, sp_len = 40, 25
    sp_lens = np.full(n_spectra, sp_len, np.int64)
    pixel_indexes = np.random.default_rng(2).permutation(n_spectra).astype(np.int64)
    mzs = np.full(n_spectra * sp_len, 123.456)
    ints = np.arange(n_spectra * sp_len, dtype=np.float32)

    _, got_int, got_sp = sort_peaks(
        mzs.copy(), ints.copy(), sp_lens, pixel_indexes, perf=SubtaskProfiler()
    )

    assert np.array_equal(got_sp, np.repeat(pixel_indexes, sp_lens).astype(np.uint32))
    assert np.array_equal(got_int, ints)  # untouched input order


def test_ties_across_partition_boundaries():
    """Heavy duplicates make splitters land on repeated values, where an inconsistent
    `side` would drop or duplicate peaks."""
    rng = np.random.default_rng(3)
    peaks = make_peaks(rng, 400, mz_alphabet=np.arange(5.0))
    got_mz, _, _ = assert_matches_reference(peaks, n_threads=8, target_partition_bytes=4096)

    assert len(got_mz) == len(peaks[0])
    assert np.all(np.diff(got_mz) >= 0)


def test_nan_mz():
    rng = np.random.default_rng(4)
    mzs, ints, sp_lens, pixel_indexes = make_peaks(rng, 200)
    mzs[rng.integers(0, len(mzs), len(mzs) // 50)] = np.nan
    assert_matches_reference((mzs, ints, sp_lens, pixel_indexes), n_threads=4)


def test_zero_length_spectra():
    """Spectra can end up empty after zero-intensity peaks are filtered out."""
    rng = np.random.default_rng(5)
    mzs, ints, sp_lens, pixel_indexes = make_peaks(rng, 300)
    sp_lens[rng.random(300) < 0.2] = 0
    mzs, ints = mzs[: sp_lens.sum()], ints[: sp_lens.sum()]
    assert_matches_reference((mzs, ints, sp_lens, pixel_indexes), n_threads=4)


def test_fewer_spectra_than_blocks():
    rng = np.random.default_rng(6)
    peaks = make_peaks(rng, 3)
    assert_matches_reference(peaks, n_threads=8, n_blocks=64)


def test_single_spectrum():
    rng = np.random.default_rng(7)
    assert_matches_reference(make_peaks(rng, 1), n_threads=4)


def test_single_peak():
    peaks = (
        np.array([1.0]),
        np.array([2.0], np.float32),
        np.array([1], np.int64),
        np.array([7], np.int64),
    )
    assert_matches_reference(peaks)


def test_empty():
    mzs, ints, sp_lens, pixel_indexes = (
        np.empty(0, 'd'),
        np.empty(0, np.float32),
        np.zeros(3, np.int64),
        np.arange(3, dtype=np.int64),
    )
    got_mz, got_int, got_sp = sort_peaks(mzs, ints, sp_lens, pixel_indexes, perf=SubtaskProfiler())

    assert len(got_mz) == len(got_int) == len(got_sp) == 0
    assert got_sp.dtype == np.uint32


@pytest.mark.parametrize('mz_dtype', ['f', 'd'])
def test_output_dtypes(mz_dtype):
    """validate_ds_segments asserts int is float32 and sp_i is uint32."""
    rng = np.random.default_rng(8)
    mzs, ints, sp_lens, pixel_indexes = make_peaks(rng, 50, mz_dtype=mz_dtype)
    got_mz, got_int, got_sp = sort_peaks(mzs, ints, sp_lens, pixel_indexes, perf=SubtaskProfiler())

    assert got_mz.dtype == np.dtype(mz_dtype)
    assert got_int.dtype == np.float32
    assert got_sp.dtype == np.uint32


def test_spectra_longer_than_sample_stride():
    """A spectrum length that is a multiple of SAMPLE_STRIDE is the aliasing shape:
    a fixed stride hits the same offsets inside every spectrum."""
    rng = np.random.default_rng(9)
    peaks = make_peaks(rng, 60, peaks_lo=2000, peaks_hi=2000)
    assert_matches_reference(peaks, n_threads=4)


def test_perf_entries_recorded():
    """`perf` is mandatory, so every run reports the same marks and the same extra data.

    load_ds aggregates these across subtasks by name, so renaming or dropping one silently
    puts a hole in the profile rather than failing anything.
    """
    rng = np.random.default_rng(10)
    mzs, ints, sp_lens, pixel_indexes = make_peaks(rng, 100)
    perf = SubtaskProfiler()

    sort_peaks(mzs, ints, sp_lens, pixel_indexes, perf=perf, n_threads=4)

    assert set(perf.entries) == {'sort_splitters', 'sort_blocks', 'sort_partitions'}
    assert set(perf.extra_data) == {'n_blocks', 'n_parts', 'n_threads', 'max_part', 'median_part'}
    assert perf.extra_data['n_threads'] == 4
    assert perf.extra_data['max_part'] >= perf.extra_data['median_part']


def test_perf_not_recorded_when_empty():
    """The zero-peak early return happens before any mark. `make_report` fills the gap
    with None, so an empty dataset thins the profile rather than breaking it."""
    perf = SubtaskProfiler()

    sort_peaks(
        np.empty(0, 'd'),
        np.empty(0, np.float32),
        np.zeros(3, np.int64),
        np.arange(3, dtype=np.int64),
        perf=perf,
    )

    assert perf.entries == {}


def test_get_n_worker_threads_uses_lambda_memory(monkeypatch):
    monkeypatch.setenv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '8192')
    assert get_n_worker_threads() == 5  # 8192 / 1769

    monkeypatch.setenv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '1024')
    assert get_n_worker_threads() == 1  # never below one thread

    monkeypatch.delenv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE')
    assert get_n_worker_threads() >= 1
