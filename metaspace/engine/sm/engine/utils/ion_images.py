"""Ion images built from the m/z-sorted browser arrays, a few annotations at a time."""
from concurrent.futures import ThreadPoolExecutor
from typing import Iterator, Optional, Tuple

import numpy as np

from sm.engine.utils.browser_arrays import DEFAULT_WORKERS


def postprocess_ion_image_chunk(  # pylint: disable=too-many-arguments
    chunk: np.ndarray,
    tic_flat: Optional[np.ndarray],
    tic_nonzero: Optional[np.ndarray],
    hotspot_percentile: int,
    tic_normalize: bool,
    log_transform_tic: bool,
) -> None:
    """Hotspot-clip, TIC-normalise and optionally log-transform ``(rows, n_pixels)`` in place."""
    n_pixels = chunk.shape[1]
    k = int(n_pixels * hotspot_percentile / 100)
    partitioned = np.partition(chunk, k, axis=1)
    thresholds = partitioned[:, k : k + 1]
    del partitioned
    thresholds = np.where(thresholds > 0, thresholds, chunk.max(axis=1)[:, np.newaxis])
    np.minimum(chunk, thresholds, out=chunk)

    if tic_normalize and tic_flat is not None and tic_nonzero is not None:
        chunk[:, tic_nonzero] /= tic_flat[tic_nonzero]
        chunk[:, ~tic_nonzero] = 0  # pylint: disable=invalid-unary-operand-type
        if log_transform_tic:
            np.log(chunk + 1e-6, out=chunk)


def iter_ion_image_chunks(  # pylint: disable=too-many-arguments
    arrays,
    mz_lo: np.ndarray,
    mz_hi: np.ndarray,
    chunk_bytes: int,
    n_pixels: int,
    rows: int,
) -> Iterator[Tuple[int, int, np.ndarray]]:
    """Yield ``(start, end, chunk)`` raw ion images for annotations ``[start, end)`` in index
    order; one ``(rows, n_pixels)`` float32 buffer is alive at a time."""
    n_ann = len(mz_lo)
    with ThreadPoolExecutor(DEFAULT_WORKERS) as executor:
        for start in range(0, n_ann, rows):
            end = min(start + rows, n_ann)
            chunk = np.zeros((end - start, n_pixels), dtype=np.float32)
            windows = arrays.iter_mz_windows(
                mz_lo[start:end], mz_hi[start:end], chunk_bytes, executor=executor
            )
            for local_idx, _, ints, sp_idxs in windows:
                if len(ints):
                    chunk[local_idx] = np.bincount(
                        sp_idxs.astype(np.int32), weights=ints, minlength=n_pixels
                    )
            yield start, end, chunk
