from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple

import numpy as np

from sm.engine.utils.perf_profile import Profiler

logger = logging.getLogger('annotation-pipeline')

TARGET_PARTITION_BYTES = 4 * 2 ** 20  # One partition's sort working set, kept L2/L3-resident
MAX_PARTITIONS = 4096  # Python-level slicing work grows with n_blocks * n_parts
SAMPLE_STRIDE = 1000  # Every SAMPLE_STRIDE'th peak is used to estimate the m/z distribution
LAMBDA_MB_PER_VCPU = 1769  # AWS Lambda allocates 1 vCPU per 1769 MB of configured memory.


def get_n_worker_threads() -> int:
    """Number of vCPUs actually available to this process.

    In AWS Lambda `os.cpu_count()` reports the host's core count rather than the share
    allocated to the function, which scales with the configured memory instead.
    """
    lambda_mb = os.environ.get('AWS_LAMBDA_FUNCTION_MEMORY_SIZE')
    if lambda_mb:
        return max(1, round(int(lambda_mb) / LAMBDA_MB_PER_VCPU))
    try:
        return len(os.sched_getaffinity(0))  # type: ignore[attr-defined]
    except AttributeError:  # non Linux
        return os.cpu_count() or 1


def _define_block_bounds(sp_lens: np.ndarray, n_blocks: int) -> Tuple[np.ndarray, np.ndarray]:
    """Split the spectra into n_blocks groups of roughly equal peak count.

    Returns (spectrum bounds, peak bounds).
    * Blocks always start and end on a spectrum boundary - not required for correctness,
      but it keeps `np.repeat` in `sort_block` simple.
    * Duplicate bounds (more blocks requested than spectra available, or runs of
      zero-length spectra) are collapsed, so fewer blocks than requested may come back.
    """
    peak_offsets = np.insert(np.cumsum(sp_lens), 0, 0)
    targets = np.linspace(0, peak_offsets[-1], n_blocks + 1)
    sp_bounds = np.unique(np.searchsorted(peak_offsets, targets, side='left'))

    # searchsorted finds the *first* offset equal to n_peaks, missing trailing zero-length spectra
    sp_bounds[-1] = len(sp_lens)
    return sp_bounds, peak_offsets[sp_bounds]


def _choose_splitters(mzs: np.ndarray, n_parts: int) -> np.ndarray:
    """
    At most n_parts-1 m/z values that separate the partitions, as quantiles of a sample.
    Duplicate quantiles are collapsed, so the caller must recompute n_parts from the result.
    """
    if n_parts <= 1:
        return np.empty(0, dtype=mzs.dtype)
    sample = np.sort(mzs[::SAMPLE_STRIDE])
    idx = (np.arange(1, n_parts) * len(sample)) // n_parts

    # Duplicates (one m/z value spanning >1/n_parts of the sample) would produce empty partitions.
    return np.unique(sample[idx])


def _calc_n_partitions(n_peaks: int, mz_itemsize: int, n_threads: int, target_bytes: int) -> int:
    """
    Number of partitions sized so one partition's sort stays within target_bytes, clamped
    to [min(4*n_threads, MAX_PARTITIONS), MAX_PARTITIONS] and to one peak per partition.
    """
    # One sorted element costs its m/z value plus an int64 permutation entry.
    sort_bytes = mz_itemsize + 8
    n_parts = int(np.ceil(n_peaks * sort_bytes / target_bytes))
    n_parts = int(np.clip(n_parts, min(4 * n_threads, MAX_PARTITIONS), MAX_PARTITIONS))
    return min(n_parts, n_peaks)


def _sort_blocks(
    mzs: np.ndarray,
    ints: np.ndarray,
    pixel_indexes: np.ndarray,
    sp_lens: np.ndarray,
    sp_bounds: np.ndarray,
    pk_bounds: np.ndarray,
    splitters: np.ndarray,
    n_threads: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """Sort every block in place, in parallel, and locate the partition boundaries.

    Returns (sp_idxs, cuts).
    * `sp_idxs` is built here, alongside the in-place sort, and comes back block-sorted
      like `mzs` and `ints`.
    * cuts[i, j] = how many peaks of block i are below splitter j, shape (n_blocks, n_parts - 1).
    * `side='left'` keeps equal m/z values on one side of every boundary, which
      stability relies on.
    """
    n_blocks = len(sp_bounds) - 1
    sp_idxs = np.empty(pk_bounds[-1], np.uint32)

    def sort_block(i):
        pk_start, pk_end = pk_bounds[i], pk_bounds[i + 1]
        sp_start, sp_end = sp_bounds[i], sp_bounds[i + 1]
        sp_idxs[pk_start:pk_end] = np.repeat(
            pixel_indexes[sp_start:sp_end], sp_lens[sp_start:sp_end]
        )

        # kind='stable' picks Timsort, which besides stability is much faster than the
        # default quicksort here: a block is many per-spectrum runs of ascending m/z.
        perm = np.argsort(mzs[pk_start:pk_end], kind='stable')
        mzs[pk_start:pk_end] = mzs[pk_start:pk_end][perm]
        ints[pk_start:pk_end] = ints[pk_start:pk_end][perm]
        sp_idxs[pk_start:pk_end] = sp_idxs[pk_start:pk_end][perm]
        return np.searchsorted(mzs[pk_start:pk_end], splitters, side='left')

    with ThreadPoolExecutor(n_threads) as pool:
        block_cuts = list(pool.map(sort_block, range(n_blocks)))

    return sp_idxs, np.stack(block_cuts)


def _define_partition_layout(
    cuts: np.ndarray, pk_bounds: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Global start/end of every (block, partition) piece, and where each partition lands.

    Returns (piece_lo, piece_hi, offsets): piece_lo/piece_hi are the (n_blocks, n_parts)
    bounds of each piece within the block-sorted arrays, offsets[p] is where partition p
    starts in the output - so partition sizes are np.diff(offsets).
    """
    n_blocks = len(pk_bounds) - 1
    piece_lo = np.column_stack([np.zeros(n_blocks, np.int64), cuts]) + pk_bounds[:-1, None]
    piece_hi = np.column_stack([cuts, np.diff(pk_bounds)]) + pk_bounds[:-1, None]
    sizes = (piece_hi - piece_lo).sum(axis=0)
    offsets = np.insert(np.cumsum(sizes), 0, 0)

    # Catches an inconsistent `side` between blocks, which would leave gaps or duplicates.
    assert offsets[-1] == pk_bounds[-1], (offsets[-1], pk_bounds[-1])
    return piece_lo, piece_hi, offsets


def _gather_partitions(
    mzs: np.ndarray,
    ints: np.ndarray,
    sp_idxs: np.ndarray,
    piece_lo: np.ndarray,
    piece_hi: np.ndarray,
    offsets: np.ndarray,
    n_threads: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Gather each partition from the block-sorted arrays, in parallel.

    This is where stability is decided, for 2 reasons:
    * Every block's piece of a partition is concatenated in block order - and therefore
      in spectrum order - before sorting.
    * The `kind='stable'` sort then preserves that order for equal m/z values.
    """
    n_peaks = len(mzs)
    n_blocks = piece_lo.shape[0]
    out_mz = np.empty(n_peaks, mzs.dtype)
    out_int = np.empty(n_peaks, ints.dtype)
    out_sp = np.empty(n_peaks, np.uint32)

    def build_partition(part_i):
        out_start, out_end = offsets[part_i], offsets[part_i + 1]
        if out_start == out_end:
            return

        # Block order here is what makes the sort stable.
        slices = [slice(piece_lo[i, part_i], piece_hi[i, part_i]) for i in range(n_blocks)]
        mz_p = np.concatenate([mzs[x] for x in slices])
        perm = np.argsort(mz_p, kind='stable')
        out_mz[out_start:out_end] = mz_p[perm]
        del mz_p
        out_int[out_start:out_end] = np.concatenate([ints[x] for x in slices])[perm]
        out_sp[out_start:out_end] = np.concatenate([sp_idxs[x] for x in slices])[perm]

    with ThreadPoolExecutor(n_threads) as pool:
        list(pool.map(build_partition, range(len(offsets) - 1)))

    return out_mz, out_int, out_sp


def sort_peaks(
    mzs: np.ndarray,
    ints: np.ndarray,
    sp_lens: np.ndarray,
    pixel_indexes: np.ndarray,
    *,
    perf: Profiler,
    n_threads: Optional[int] = None,
    n_blocks: Optional[int] = None,
    target_partition_bytes: int = TARGET_PARTITION_BYTES,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sort mzs/ints/sp_idxs by m/z in parallel, stably.

    "Stably" is a hard requirement, not an optimization: equal m/z values must preserve
    their ordering by spectrum index, because the order of pixels affects some metrics.

    Both points below are about peak memory:
    * `sp_idxs` is built here from `sp_lens` and `pixel_indexes` rather than being passed
      in. An unsorted copy held by the caller couldn't be garbage-collected during the
      sort, so it's kept in this compacted form until the last minute.
    * `mzs` and `ints` are sorted in place blockwise, so the caller's copies are left
      permuted. Use only the returned arrays afterwards.
    """
    n_peaks = len(mzs)
    assert len(ints) == n_peaks, (len(ints), n_peaks)
    if n_peaks == 0:
        return mzs, ints, np.empty(0, np.uint32)

    n_threads = n_threads or get_n_worker_threads()
    n_blocks = n_blocks or max(1, min(4 * n_threads, len(sp_lens)))

    n_parts = _calc_n_partitions(n_peaks, mzs.itemsize, n_threads, target_partition_bytes)
    splitters = _choose_splitters(mzs, n_parts)
    n_parts = len(splitters) + 1
    perf.record_entry('sort_splitters')

    sp_bounds, pk_bounds = _define_block_bounds(sp_lens, n_blocks)
    n_blocks = len(sp_bounds) - 1
    sp_idxs, cuts = _sort_blocks(
        mzs, ints, pixel_indexes, sp_lens, sp_bounds, pk_bounds, splitters, n_threads
    )

    piece_lo, piece_hi, offsets = _define_partition_layout(cuts, pk_bounds)
    sizes = np.diff(offsets)
    logger.debug(
        f'Sorting {n_peaks} peaks: {n_blocks} blocks, {n_parts} partitions, '
        f'{n_threads} threads, largest partition {sizes.max()}'
    )
    perf.record_entry(
        'sort_blocks',
        n_blocks=n_blocks,
        n_parts=n_parts,
        n_threads=n_threads,
        max_part=int(sizes.max()),
        median_part=int(np.median(sizes)),
    )

    sorted_arrays = _gather_partitions(mzs, ints, sp_idxs, piece_lo, piece_hi, offsets, n_threads)
    perf.record_entry('sort_partitions')
    return sorted_arrays
