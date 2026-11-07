"""Unit tests for the segmentation job/image cleanup helpers."""

from unittest.mock import MagicMock, patch

import pytest

from sm.engine.postprocessing.segmentation_wrapper import (
    del_segmentation_job_images,
    delete_segmentation_job,
    save_segmentation_result,
)

MODULE = 'sm.engine.postprocessing.segmentation_wrapper'


@patch(f'{MODULE}.image_storage')
def test_delete_segmentation_job_removes_image_and_row(image_storage):
    db = MagicMock()
    db.select_one.return_value = ('img-9',)

    delete_segmentation_job('ds', 9, db)

    image_storage.delete_image.assert_called_once_with(image_storage.DIAG, 'ds', 'img-9')
    db.alter.assert_called_once()
    args = db.alter.call_args[0]
    assert args[0] == 'DELETE FROM image_segmentation_job WHERE id = %s'
    assert args[1] == (9,)


@patch(f'{MODULE}.image_storage')
def test_delete_segmentation_job_deletes_row_before_images(image_storage):
    db = MagicMock()
    db.select_one.return_value = ('img-9',)
    order = MagicMock()
    order.attach_mock(db.alter, 'alter')
    order.attach_mock(image_storage.delete_image, 'delete_image')

    delete_segmentation_job('ds', 9, db)

    assert [c[0] for c in order.mock_calls] == ['alter', 'delete_image']


@patch(f'{MODULE}.image_storage')
def test_delete_segmentation_job_image_failure_keeps_row_deleted(image_storage):
    db = MagicMock()
    db.select_one.return_value = ('img-9',)
    image_storage.delete_image.side_effect = RuntimeError('s3 down')

    with pytest.raises(RuntimeError):
        delete_segmentation_job('ds', 9, db)

    db.alter.assert_called_once_with('DELETE FROM image_segmentation_job WHERE id = %s', (9,))


@patch(f'{MODULE}.image_storage')
def test_delete_segmentation_job_missing_row_is_noop(image_storage):
    db = MagicMock()
    db.select_one.return_value = None

    delete_segmentation_job('ds', 9, db)

    image_storage.delete_image.assert_not_called()
    db.alter.assert_not_called()


@patch(f'{MODULE}.image_storage')
def test_del_segmentation_job_images(image_storage):
    db = MagicMock()
    db.select.return_value = [('a',), ('b',)]

    del_segmentation_job_images('ds', db)

    image_storage.delete_images.assert_called_once_with(image_storage.DIAG, 'ds', ['a', 'b'])


LABEL_MAP_IMAGE = {
    'key': 'LABEL_MAP',
    'image_id': 'new-img',
    'url': 'http://s3/new-img',
    'format': 'NPY',
}


@pytest.fixture(name='seg_result')
def seg_result_fixture():
    return {
        'algorithm': 'kmeans',
        'map_type': 'labels',
        'label_map': [[0, 1]],
        'n_segments': 2,
        'parameters_used': {'k': 2},
        'segment_summary': [],
        'diagnostics': {},
        'segment_profiles': [],
    }


def make_db(job_row, slot_ids=(), referenced_ids=()):
    db = MagicMock()
    db.select_one.return_value = job_row

    def select(sql, params=None):
        if 'experiment_dataset' in sql:
            return [(i,) for i in referenced_ids]
        return [(i,) for i in slot_ids]

    db.select.side_effect = select
    db.insert_return.return_value = ['u0', 'u1']
    return db


def slot_query(db):
    return next(c[0] for c in db.select.call_args_list if 'image_segmentation_job' in c[0][0])


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_default_job_writes_row(_save, _delete, seg_result):
    db = make_db(('u1', True))

    save_segmentation_result('ds', 5, seg_result, db)

    update_calls = [c for c in db.alter.call_args_list if 'SET result' in c[0][0]]
    assert len(update_calls) == 1
    params = update_calls[0][1]['params']
    assert '"n_segments": 2' in params[0]
    assert params[1:] == ('new-img', 'http://s3/new-img', 5)


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_private_job_writes_row(_save, _delete, seg_result):
    db = make_db(('u1', False))

    save_segmentation_result('ds', 5, seg_result, db)

    assert any('SET result' in c[0][0] for c in db.alter.call_args_list)


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_default_rerun_replaces_only_default_jobs(_save, delete_job, seg_result):
    db = make_db(('u1', True), slot_ids=[3, 4])

    save_segmentation_result('ds', 5, seg_result, db)

    assert [c[0] for c in delete_job.call_args_list] == [('ds', 3, db), ('ds', 4, db)]
    slot_sql, slot_params = slot_query(db)
    assert slot_params == ('ds', 5)
    assert "status NOT IN ('QUEUED', 'STARTED')" in slot_sql
    assert 'is_default = true' in slot_sql
    assert 'user_id' not in slot_sql


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_private_rerun_replaces_only_own_private_jobs(_save, delete_job, seg_result):
    db = make_db(('u1', False), slot_ids=[7])

    save_segmentation_result('ds', 5, seg_result, db)

    delete_job.assert_called_once_with('ds', 7, db)
    args = slot_query(db)
    assert "status NOT IN ('QUEUED', 'STARTED')" in args[0]
    assert 'is_default = false AND user_id = %s' in args[0]
    assert args[1][-1] == 'u1'


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image')
def test_missing_job_drops_result_without_saving(save, delete_job, seg_result):
    db = make_db(None)

    save_segmentation_result('ds', 5, seg_result, db)

    save.assert_not_called()
    delete_job.assert_not_called()
    db.alter.assert_not_called()


@patch(f'{MODULE}.delete_segmentation_job', side_effect=RuntimeError('s3 down'))
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_failed_replacement_cleanup_still_finishes_job(_save, _delete, seg_result):
    db = make_db(('u1', True), slot_ids=[3, 4])

    with patch(f'{MODULE}.logger') as log:
        save_segmentation_result('ds', 5, seg_result, db)

    assert log.warning.call_count == 2
    assert 'Failed to delete replaced segmentation job 3' in log.warning.call_args_list[0][0][0]
    assert "SET status = 'FINISHED'" in db.alter.call_args[0][0]


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_replacement_keeps_jobs_used_by_an_experiment(_save, delete_job, seg_result):
    db = make_db(('u1', True), slot_ids=[3, 4], referenced_ids=[4])

    with patch(f'{MODULE}.logger') as log:
        save_segmentation_result('ds', 5, seg_result, db)

    delete_job.assert_called_once_with('ds', 3, db)
    ref_calls = [c[0] for c in db.select.call_args_list if 'experiment_dataset' in c[0][0]]
    assert len(ref_calls) == 1
    assert ref_calls[0][1] == ([3, 4],)
    warnings = [c[0][0] for c in log.warning.call_args_list]
    assert warnings == ['Keeping replaced segmentation job 4 for dataset ds: used by an experiment']
    assert "SET status = 'FINISHED'" in db.alter.call_args[0][0]


@patch(f'{MODULE}.delete_segmentation_job')
@patch(f'{MODULE}.save_diagnostic_image', return_value=LABEL_MAP_IMAGE)
def test_replacement_skips_experiment_query_when_slot_empty(_save, delete_job, seg_result):
    db = make_db(('u1', True))

    save_segmentation_result('ds', 5, seg_result, db)

    delete_job.assert_not_called()
    assert not any('experiment_dataset' in c[0][0] for c in db.select.call_args_list)
