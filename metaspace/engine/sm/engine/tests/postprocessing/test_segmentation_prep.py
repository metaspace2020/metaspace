import numpy as np

from sm.engine.postprocessing.segmentation_data_loader import fill_intensity_matrix
from sm.engine.tests.fakes import InMemoryArrays


def _old_style_reference(  # pylint: disable=too-many-arguments, too-many-locals
    mzs, ints, sp_idxs, mz_lo, mz_hi, n_pixels, tic_flat, chunk_size
):
    """Transcription of the pre-streaming loader: full (n_ann, n_pixels) matrix, then mask."""
    lefts = np.searchsorted(mzs, mz_lo, side='left')
    rights = np.searchsorted(mzs, mz_hi, side='right')
    n_ann = len(mz_lo)
    tic_nonzero = tic_flat > 0
    full = np.empty((n_ann, n_pixels), np.float32)
    for start in range(0, n_ann, chunk_size):
        end = min(start + chunk_size, n_ann)
        chunk = np.zeros((end - start, n_pixels), np.float32)
        for i in range(end - start):
            low, high = lefts[start + i], rights[start + i]
            if low < high:
                chunk[i] = np.bincount(
                    sp_idxs[low:high], weights=ints[low:high], minlength=n_pixels
                )
        k = int(n_pixels * 99 / 100)
        thresholds = np.partition(chunk, k, axis=1)[:, k : k + 1]
        thresholds = np.where(thresholds > 0, thresholds, chunk.max(axis=1)[:, np.newaxis])
        np.minimum(chunk, thresholds, out=chunk)
        chunk[:, tic_nonzero] /= tic_flat[tic_nonzero]
        chunk[:, ~tic_nonzero] = 0
        full[start:end] = chunk
    return full[:, tic_nonzero].T


def test_fill_intensity_matrix_matches_old_full_matrix_path():
    rng = np.random.default_rng(5)
    n_pixels, n_ann = 120, 9
    mzs = np.sort(rng.uniform(100, 200, 6000)).astype('f')
    ints = rng.uniform(0, 100, 6000).astype('f')
    sp_idxs = rng.integers(0, n_pixels, 6000).astype(np.int32)
    theo = np.linspace(105, 195, n_ann)
    mz_lo, mz_hi = theo - 0.4, theo + 0.4
    tic_flat = np.bincount(sp_idxs, weights=ints, minlength=n_pixels).astype('f')
    tic_flat[:7] = 0

    expected = _old_style_reference(mzs, ints, sp_idxs, mz_lo, mz_hi, n_pixels, tic_flat, 4)
    matrix = fill_intensity_matrix(
        InMemoryArrays(mzs, ints, sp_idxs, seed=11),
        mz_lo,
        mz_hi,
        chunk_bytes=1 << 20,
        n_pixels=n_pixels,
        rows=4,
        tic_flat=tic_flat,
        hotspot_percentile=99,
    )

    assert matrix.shape == (int((tic_flat > 0).sum()), n_ann)
    np.testing.assert_array_equal(matrix, expected)
