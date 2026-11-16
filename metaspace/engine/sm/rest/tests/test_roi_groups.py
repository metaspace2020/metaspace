import numpy as np
import pytest

from sm.engine.tests.fakes import InMemoryArrays
from sm.rest.diff_roi_manager import build_comparison, compute_roi_metrics, precompute_roi_info


def _masks(n):
    flat = np.arange(n * 4) % n
    return {i + 1: (flat == i).reshape(n, 4).astype(np.uint8) for i in range(n)}


def test_no_labels_is_vs_rest_per_roi():
    comparison = build_comparison(_masks(3), {})
    assert comparison['mode'] == 'vs_rest'
    assert len(comparison['targets']) == 3
    assert comparison['reference_label'] is None


def test_two_unlabeled_rois_stay_vs_rest():
    comparison = build_comparison(_masks(2), {1: ' ', 2: None})
    assert comparison['mode'] == 'vs_rest'
    assert len(comparison['targets']) == 2


def test_two_labeled_groups_score_alphabetically_first():
    labels = {1: 'b', 2: 'A', 3: 'b'}
    comparison = build_comparison(_masks(3), labels)
    assert comparison['mode'] == 'two_group'
    (target,) = comparison['targets']
    assert comparison['labels'][target] == 'A'
    assert comparison['reference_label'] == 'b'
    assert sorted(comparison['members'][comparison['targets'][0]]) == [2]


def test_group_mask_is_union_of_members():
    masks = _masks(3)
    comparison = build_comparison(masks, {1: 'x', 2: 'x', 3: 'y'})
    union = (masks[1] | masks[2]).astype(bool)
    key = next(k for k, v in comparison['labels'].items() if v == 'x')
    np.testing.assert_array_equal(comparison['group_masks'][key], union)


def test_labeled_group_sorts_before_unlabeled_roi():
    comparison = build_comparison(_masks(2), {1: None, 2: 'z'}, names={1: 'a-roi', 2: 'z-roi'})
    assert comparison['mode'] == 'two_group'
    assert comparison['labels'][comparison['targets'][0]] == 'z'
    assert comparison['reference_label'] == 'a-roi'


def test_fewer_than_two_groups_raises():
    with pytest.raises(ValueError):
        build_comparison(_masks(3), {1: 'g', 2: 'g', 3: 'g'})


def test_member_lfc_is_pixel_weighted_to_pooled_lfc():
    n_pixels = 400
    rng = np.random.default_rng(1)
    mzs = np.sort(rng.uniform(100, 110, 5000)).astype('f')
    ints = rng.uniform(1, 100, 5000).astype('f')
    sp_idxs = rng.integers(0, n_pixels, 5000).astype(np.int32)
    tic_flat = np.bincount(sp_idxs, weights=ints, minlength=n_pixels).astype('f') + 1
    flat = np.arange(n_pixels) % 4
    masks = {i + 1: (flat == i).reshape(20, 20).astype(np.uint8) for i in range(3)}
    comparison = build_comparison(masks, {1: 'g', 2: 'g', 3: 'h'})
    info = precompute_roi_info(comparison['group_masks'])
    key = comparison['targets'][0]
    roi_info = {key: info[key]}
    roi_info[key]['in_samples'] = roi_info[key]['in_idx']
    roi_info[key]['out_samples'] = np.resize(roi_info[key]['out_idx'], len(roi_info[key]['in_idx']))
    roi_info[key]['members'] = {
        roi_id: {'mask_f': masks[roi_id].ravel().astype(np.float32), 'n': masks[roi_id].sum()}
        for roi_id in comparison['members'][key]
    }
    results = compute_roi_metrics(
        InMemoryArrays(mzs, ints, sp_idxs, seed=0),
        np.array([102.0]),
        np.array([108.0]),
        chunk_bytes=1 << 20,
        n_pixels=n_pixels,
        rows=1,
        roi_info=roi_info,
        tic_flat=tic_flat,
        tic_nonzero=tic_flat > 0,
        hotspot_percentile=99,
        tic_normalize=True,
        log_transform_tic=True,
    )[key]
    weights = {r: masks[r].sum() for r in results['roi_lfc']}
    pooled = sum(weights[r] * results['roi_lfc'][r] for r in weights) / sum(weights.values())
    np.testing.assert_allclose(pooled, results['log2fc'], rtol=1e-4, atol=1e-5)
