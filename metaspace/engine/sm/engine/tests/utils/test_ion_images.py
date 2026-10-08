import numpy as np

from sm.engine.tests.fakes import InMemoryArrays
from sm.engine.utils.ion_images import iter_ion_image_chunks, postprocess_ion_image_chunk


def _synthetic(n_peaks=5000, n_pixels=100, n_ann=11):
    rng = np.random.default_rng(3)
    mzs = np.sort(rng.uniform(100, 200, n_peaks)).astype('f')
    ints = rng.uniform(0, 100, n_peaks).astype('f')
    sp_idxs = rng.integers(0, n_pixels, n_peaks).astype(np.int32)
    theo = np.linspace(105, 195, n_ann)
    theo[4] = 500.0  # a window with no peaks at all
    return mzs, ints, sp_idxs, theo - 0.5, theo + 0.5


def _reference_rows(mzs, ints, sp_idxs, mz_lo, mz_hi, n_pixels):
    lefts = np.searchsorted(mzs, mz_lo, side='left')
    rights = np.searchsorted(mzs, mz_hi, side='right')
    full = np.zeros((len(mz_lo), n_pixels), np.float32)
    for i in range(len(mz_lo)):
        if lefts[i] < rights[i]:
            full[i] = np.bincount(
                sp_idxs[lefts[i] : rights[i]],
                weights=ints[lefts[i] : rights[i]],
                minlength=n_pixels,
            )
    return full


def test_chunks_cover_annotations_in_index_order_with_exact_rows():
    mzs, ints, sp_idxs, mz_lo, mz_hi = _synthetic()
    n_pixels = 100
    expected = _reference_rows(mzs, ints, sp_idxs, mz_lo, mz_hi, n_pixels)

    chunks = list(
        iter_ion_image_chunks(
            InMemoryArrays(mzs, ints, sp_idxs, seed=7), mz_lo, mz_hi, 1 << 20, n_pixels, rows=4
        )
    )

    assert [(s, e) for s, e, _ in chunks] == [(0, 4), (4, 8), (8, 11)]
    for start, end, chunk in chunks:
        assert chunk.dtype == np.float32 and chunk.shape == (end - start, n_pixels)
        np.testing.assert_array_equal(chunk, expected[start:end])


def test_postprocess_without_tic_only_clips_hotspots():
    chunk = np.array([[1.0, 2.0, 3.0, 100.0]], np.float32)
    postprocess_ion_image_chunk(chunk, None, None, 50, tic_normalize=False, log_transform_tic=False)
    # k = int(4 * 50 / 100) = 2 -> threshold is the 3rd smallest value
    np.testing.assert_array_equal(chunk, [[1.0, 2.0, 3.0, 3.0]])
