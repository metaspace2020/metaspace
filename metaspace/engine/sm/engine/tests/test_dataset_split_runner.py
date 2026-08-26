"""Unit tests for the DB-aware parts of dataset splitting."""

from unittest.mock import MagicMock, patch

import numpy as np

from sm.engine import dataset_split_runner
from sm.engine.dataset_split_runner import (
    MIN_ROI_PIXELS,
    SplitChildStatus,
    SplitJobStatus,
    mark_child_terminal,
    roi_pixel_counts,
)


def _roi_row(roi_id, name, coords, is_default=False):
    geojson = {
        'type': 'Feature',
        'properties': {'id': roi_id, 'coordinates': [{'x': x, 'y': y} for x, y in coords]},
    }
    return (roi_id, name, is_default, geojson)


def _square(x0, y0, size):
    return [(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)]


@patch.object(dataset_split_runner, 'get_tic_image')
def test_roi_pixel_counts_uses_tic_as_sample_area(mock_tic):
    # 100x100 grid, but only the top half has any signal.
    tic = np.zeros((100, 100), dtype=float)
    tic[:50, :] = 5.0
    mock_tic.return_value = tic

    db = MagicMock()
    db.select.return_value = [_roi_row(1, 'spans both halves', _square(0, 25, 50))]

    [roi] = roi_pixel_counts(db, 'ds-1')

    # Only the rows that actually contain spectra count towards the ROI's size.
    assert roi['n_pixels'] == 51 * 25
    assert roi['roi_id'] == 1 and roi['name'] == 'spans both halves'


@patch.object(dataset_split_runner, 'get_tic_image')
def test_roi_pixel_counts_ignores_nan_padding(mock_tic):
    # Outside the sample area the TIC image holds NaN, which must not count as data.
    tic = np.full((20, 20), np.nan)
    tic[0:4, 0:4] = 1.0
    mock_tic.return_value = tic

    db = MagicMock()
    db.select.return_value = [_roi_row(1, 'roi', _square(0, 0, 19))]

    [roi] = roi_pixel_counts(db, 'ds-1')

    assert roi['n_pixels'] == 16


@patch.object(dataset_split_runner, 'get_tic_image')
def test_roi_pixel_counts_flags_blocked_and_warning_sizes(mock_tic):
    mock_tic.return_value = np.ones((200, 200))

    db = MagicMock()
    db.select.return_value = [
        _roi_row(1, 'tiny', _square(0, 0, 5)),
        _roi_row(2, 'smallish', _square(0, 0, 35)),
        _roi_row(3, 'big', _square(0, 0, 150)),
    ]

    tiny, smallish, big = roi_pixel_counts(db, 'ds-1')

    assert tiny['n_pixels'] < MIN_ROI_PIXELS
    assert tiny['blocked'] and not tiny['warning']
    assert smallish['blocked'] is False and smallish['warning'] is True
    assert big['blocked'] is False and big['warning'] is False


@patch.object(dataset_split_runner, 'get_tic_image')
def test_roi_pixel_counts_returns_zero_for_unusable_geojson(mock_tic):
    mock_tic.return_value = np.ones((10, 10))

    db = MagicMock()
    db.select.return_value = [(1, 'empty', False, {'features': []})]

    [roi] = roi_pixel_counts(db, 'ds-1')

    assert roi['n_pixels'] == 0 and roi['blocked'] is True


def test_roi_pixel_counts_short_circuits_when_dataset_has_no_rois():
    db = MagicMock()
    db.select.return_value = []

    assert roi_pixel_counts(db, 'ds-1') == []
    # The TIC image is only fetched when there is something to measure.
    db.select_one.assert_not_called()


def _child_row():
    return (7, 42, 'child-ds', 'roi A', {'x0': 3, 'y0': 4}, 'parent-ds')


def test_mark_child_terminal_returns_none_for_a_non_split_dataset():
    db = MagicMock()
    db.select_one.return_value = None

    assert mark_child_terminal(db, 'not-a-child', SplitChildStatus.FINISHED) is None
    db.alter.assert_not_called()


def test_mark_child_terminal_waits_for_remaining_children():
    db = MagicMock()
    db.select_one.side_effect = [_child_row(), (2,)]  # child row, then 2 still pending

    assert mark_child_terminal(db, 'child-ds', SplitChildStatus.FINISHED) is None
    # The child's own status is still recorded, just no summary yet.
    assert db.alter.call_count == 1


def test_mark_child_terminal_finishes_the_job_once_all_children_are_terminal():
    db = MagicMock()
    db.select_one.side_effect = [_child_row(), (0,)]  # child row, then nothing pending

    # Each child now emails its own submitter like any other dataset, so there is no job-wide
    # summary to return — only the child's own status update and the job's terminal flip.
    assert mark_child_terminal(db, 'child-ds', SplitChildStatus.FINISHED) is None
    assert db.alter.call_count == 2
    assert SplitJobStatus.FINISHED in str(db.alter.call_args_list)
