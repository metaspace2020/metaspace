"""The streaming diff-ROI core must reproduce the original full-array computation exactly.

The ROI means are a float32 matrix-vector product whose rounding depends on how many
image rows share a chunk, so bit-identical results require the same annotation grouping
as the original run (annotation index order, ``rows`` per chunk). With a different
``rows`` the results agree to float32 precision only.
"""
import numpy as np

from sm.engine.tests.fakes import InMemoryArrays
from sm.rest.diff_roi_manager import (
    compute_roi_metrics,
    postprocess_ion_image_chunk,
    precompute_roi_info,
)


def _reference(  # pylint: disable=too-many-arguments, too-many-locals
    lefts, rights, ints, sp_idxs, n_pixels, roi_info, tic_flat, tic_nonzero, n_ann
):
    """Transcription of the pre-streaming algorithm: one chunk holding every annotation."""
    chunk = np.zeros((n_ann, n_pixels), dtype=np.float32)
    for i in range(n_ann):
        if lefts[i] < rights[i]:
            chunk[i] = np.bincount(
                sp_idxs[lefts[i] : rights[i]],
                weights=ints[lefts[i] : rights[i]],
                minlength=n_pixels,
            )
    k = int(n_pixels * 99 / 100)
    partitioned = np.partition(chunk, k, axis=1)
    thresholds = partitioned[:, k : k + 1]
    thresholds = np.where(thresholds > 0, thresholds, chunk.max(axis=1)[:, np.newaxis])
    np.minimum(chunk, thresholds, out=chunk)
    chunk[:, tic_nonzero] /= tic_flat[tic_nonzero]
    chunk[:, ~tic_nonzero] = 0
    np.log(chunk + 1e-6, out=chunk)

    results = {}
    for roi_id, info in roi_info.items():
        mean_in = (chunk @ info['in_mask_f']) / info['n_in']
        mean_out = (chunk @ info['out_mask_f']) / info['n_out']
        log2fc = (mean_in - mean_out) * (1 / np.log(2))
        auc = (chunk[:, info['in_samples']] > chunk[:, info['out_samples']]).mean(axis=1)
        results[roi_id] = {'log2fc': log2fc.astype(np.float32), 'auc': auc.astype(np.float32)}
    return results


def _synthetic(seed=0, n_peaks=20000, n_pixels=400, n_ann=7):
    rng = np.random.default_rng(seed)
    mzs = np.sort(rng.uniform(100, 200, n_peaks)).astype('f')
    ints = rng.uniform(0, 100, n_peaks).astype('f')
    sp_idxs = rng.integers(0, n_pixels, n_peaks).astype(np.int32)
    theo = np.linspace(105, 195, n_ann)
    mz_lo, mz_hi = theo - 0.5, theo + 0.5
    lefts = np.searchsorted(mzs, mz_lo, side='left')
    rights = np.searchsorted(mzs, mz_hi, side='right')
    tic_flat = np.bincount(sp_idxs, weights=ints, minlength=n_pixels).astype('f')
    tic_flat[:10] = 0
    tic_nonzero = tic_flat > 0
    roi_masks = {
        1: (np.arange(n_pixels) % 3 == 0).reshape(20, 20).astype(np.uint8),
        2: (np.arange(n_pixels) % 3 == 1).reshape(20, 20).astype(np.uint8),
    }
    return mzs, ints, sp_idxs, mz_lo, mz_hi, lefts, rights, tic_flat, tic_nonzero, roi_masks


def _run(rows):
    mzs, ints, sp_idxs, mz_lo, mz_hi, lefts, rights, tic_flat, tic_nonzero, masks = _synthetic()
    n_pixels, n_ann = len(tic_flat), len(lefts)

    roi_info = precompute_roi_info(masks)
    np.random.seed(0)
    for info in roi_info.values():
        info['in_samples'] = np.random.choice(info['in_idx'], size=50, replace=True)
        info['out_samples'] = np.random.choice(info['out_idx'], size=50, replace=True)

    expected = _reference(
        lefts, rights, ints, sp_idxs, n_pixels, roi_info, tic_flat, tic_nonzero, n_ann
    )
    results = compute_roi_metrics(
        InMemoryArrays(mzs, ints, sp_idxs, seed=42),
        mz_lo,
        mz_hi,
        chunk_bytes=1 << 20,
        n_pixels=n_pixels,
        rows=rows,
        roi_info=roi_info,
        tic_flat=tic_flat,
        tic_nonzero=tic_nonzero,
        hotspot_percentile=99,
        tic_normalize=True,
        log_transform_tic=True,
    )
    return expected, results, roi_info


def test_same_grouping_as_original_run_is_bit_identical():
    expected, results, roi_info = _run(rows=7)
    for roi_id in roi_info:
        np.testing.assert_array_equal(results[roi_id]['log2fc'], expected[roi_id]['log2fc'])
        np.testing.assert_array_equal(results[roi_id]['auc'], expected[roi_id]['auc'])


def test_smaller_groups_agree_to_float32_precision():
    expected, results, roi_info = _run(rows=3)
    for roi_id in roi_info:
        np.testing.assert_allclose(
            results[roi_id]['log2fc'], expected[roi_id]['log2fc'], rtol=1e-5, atol=1e-5
        )
        np.testing.assert_array_equal(results[roi_id]['auc'], expected[roi_id]['auc'])


def test_empty_window_gives_all_zero_image_row():
    n_pixels = 50
    tic_flat = np.ones(n_pixels, 'f')
    chunk = np.zeros((1, n_pixels), 'f')
    postprocess_ion_image_chunk(chunk, tic_flat, tic_flat > 0, 99, True, False)
    np.testing.assert_array_equal(chunk, np.zeros((1, n_pixels), 'f'))


def test_precompute_roi_info_out_mask_is_other_rois_only():
    masks = {
        1: np.array([[1, 1, 0, 0]], np.uint8),
        2: np.array([[0, 0, 1, 0]], np.uint8),
    }
    info = precompute_roi_info(masks)
    np.testing.assert_array_equal(info[1]['out_idx'], [2])
    np.testing.assert_array_equal(info[2]['out_idx'], [0, 1])
    assert info[1]['n_in'] == 2 and info[1]['n_out'] == 1
