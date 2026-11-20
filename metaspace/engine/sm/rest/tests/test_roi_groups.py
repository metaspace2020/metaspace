from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from sm.engine.tests.fakes import InMemoryArrays
from sm.rest.diff_roi_manager import (
    DiffROIManager,
    build_comparison,
    compute_roi_metrics,
    precompute_roi_info,
)


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


def _run_diff_roi(labels, roi_ids=(1, 2, 3, 4), scope_roi_ids=None):
    """run_diff_roi over synthetic data: 4 ROIs striped over a 20x20 image, 3 annotations."""
    n_pixels = 400
    rng = np.random.default_rng(1)
    mzs = np.sort(rng.uniform(100, 110, 5000)).astype('f')
    ints = rng.uniform(1, 100, 5000).astype('f')
    sp_idxs = rng.integers(0, n_pixels, 5000).astype(np.int32)
    tic_flat = np.bincount(sp_idxs, weights=ints, minlength=n_pixels).astype('f') + 1
    flat = np.arange(n_pixels) % 5
    diff_data = {
        'mz_lo': np.array([101.0, 104.0, 107.0]),
        'mz_hi': np.array([103.0, 106.0, 109.0]),
        'n_pixels': n_pixels,
        'formulas': np.array(['A', 'B', 'C']),
        'modifiers': np.array(['+H', '+H', '+H']),
        'tic_flat': tic_flat,
        'tic_nonzero': tic_flat > 0,
        'roi_masks': {i + 1: (flat == i).reshape(20, 20).astype(np.uint8) for i in range(4)},
        'roi_labels': labels,
        'roi_names': {i: f'roi{i}' for i in range(1, 5)},
        'hotspot_percentile': 99,
        'tic_normalize': True,
        'log_transform_tic': True,
    }
    arrays = InMemoryArrays(mzs, ints, sp_idxs, seed=0)
    data = MagicMock()
    data.prepare_data_for_diff_analysis.return_value = diff_data
    data.browser_arrays.return_value = arrays
    with patch('sm.rest.diff_roi_manager.SMConfig.get_conf', return_value={}), patch(
        'sm.rest.diff_roi_manager.DiffROIData', return_value=data
    ):
        np.random.seed(0)
        df = DiffROIManager(db=MagicMock()).run_diff_roi(
            'ds', list(roi_ids), scope_roi_ids, chunk_size=2, n_pixel_samples=50
        )
    return df, diff_data, arrays, data


def test_run_diff_roi_skips_member_lfc_for_single_member_groups():
    labels = {1: 'g', 2: 'g', 3: None, 4: ' '}
    df, diff_data, arrays, _ = _run_diff_roi(labels)

    # The pre-change computation of log2fc/auc: group masks only, no member work
    comparison = build_comparison(diff_data['roi_masks'], labels, diff_data['roi_names'])
    info = precompute_roi_info(comparison['group_masks'])
    np.random.seed(0)
    for key in comparison['targets']:
        info[key]['in_samples'] = np.random.choice(info[key]['in_idx'], size=50, replace=True)
        info[key]['out_samples'] = np.random.choice(info[key]['out_idx'], size=50, replace=True)
    expected = compute_roi_metrics(
        arrays,
        diff_data['mz_lo'],
        diff_data['mz_hi'],
        chunk_bytes=1 << 20,
        n_pixels=400,
        rows=2,
        roi_info=info,
        tic_flat=diff_data['tic_flat'],
        tic_nonzero=diff_data['tic_nonzero'],
        hotspot_percentile=99,
        tic_normalize=True,
        log_transform_tic=True,
    )
    by_roi = {roi_id: roi_df for roi_id, roi_df in df.groupby('roi_id')}
    assert sorted(by_roi) == [1, 2, 3, 4]
    for key, roi_ids in comparison['members'].items():
        for roi_id in roi_ids:
            np.testing.assert_array_equal(by_roi[roi_id]['log2fc'], expected[key]['log2fc'])
            np.testing.assert_array_equal(by_roi[roi_id]['auc'], expected[key]['auc'])

    assert by_roi[3]['roi_lfc'].isna().all() and by_roi[4]['roi_lfc'].isna().all()
    assert by_roi[1]['roi_lfc'].notna().all() and by_roi[2]['roi_lfc'].notna().all()
    assert not np.allclose(by_roi[1]['roi_lfc'], by_roi[2]['roi_lfc'])
    # equal-sized members: the pooled LFC is the mean of the member LFCs
    pooled = (by_roi[1]['roi_lfc'].values + by_roi[2]['roi_lfc'].values) / 2
    np.testing.assert_allclose(pooled, by_roi[1]['log2fc'].values, rtol=1e-4, atol=1e-5)


def test_run_diff_roi_checks_the_whole_scope_belongs_to_the_dataset():
    _, _, _, data = _run_diff_roi({}, roi_ids=('1', '2'), scope_roi_ids=['1', '2', '3'])
    data.check_roi_ids.assert_called_once_with({1, 2, 3})
    data.prepare_data_for_diff_analysis.assert_called_once_with([1, 2])


@pytest.mark.parametrize(
    'roi_ids, scope_roi_ids',
    [([1], None), ([], [1, 2]), ([1, 2], [1]), ([1, 2], [])],
)
def test_run_diff_roi_rejects_bad_roi_id_sets(roi_ids, scope_roi_ids):
    data = MagicMock()
    with patch('sm.rest.diff_roi_manager.SMConfig.get_conf', return_value={}), patch(
        'sm.rest.diff_roi_manager.DiffROIData', return_value=data
    ), pytest.raises(ValueError, match='subset of scope_roi_ids'):
        DiffROIManager(db=MagicMock()).run_diff_roi('ds', roi_ids, scope_roi_ids)
    data.check_roi_ids.assert_not_called()
    data.prepare_data_for_diff_analysis.assert_not_called()
