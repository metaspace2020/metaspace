"""Unit tests for :class:`sm.rest.segmentation_manager.SegmentationManager`."""

from unittest.mock import MagicMock, patch

import pytest

from sm.rest.segmentation_manager import SegmentationManager


class FakeDB:
    """Records writes and answers selects by SQL prefix."""

    def __init__(self, submitter=None):
        self.submitter = submitter
        self.insert_calls = []
        self.alter_calls = []

    def alter(self, sql, params=None):
        self.alter_calls.append((sql, params))

    def insert_return(self, sql, rows):
        self.insert_calls.append((sql, rows))
        return [11]

    def select_one(self, sql, params=None):
        if sql.startswith('SELECT user_id FROM graphql.dataset'):
            return self.submitter
        raise AssertionError(f'unexpected SQL: {sql}')


def _make_mgr(db):
    with patch(
        'sm.rest.segmentation_manager.SMConfig.get_conf',
        return_value={'rabbitmq': {}, 'services': {}},
    ), patch('sm.rest.segmentation_manager.QueuePublisher', MagicMock()):
        return SegmentationManager(db)


@patch('sm.rest.segmentation_manager.QueuePublisher', MagicMock())
def test_run_segmentation_stores_user_and_default_flag():
    db = FakeDB()
    mgr = _make_mgr(db)

    result = mgr.run_segmentation('ds', user_id='u1', is_default=False)

    assert result == {'job_id': 11, 'ds_id': 'ds'}
    sql, rows = db.insert_calls[0]
    assert 'user_id, is_default' in sql
    assert rows[0][-2:] == ('u1', False)


@patch('sm.rest.segmentation_manager.QueuePublisher', MagicMock())
def test_run_segmentation_defaults_to_dataset_submitter():
    db = FakeDB(submitter=('sub-1',))
    mgr = _make_mgr(db)

    mgr.run_segmentation('ds')

    _, rows = db.insert_calls[0]
    assert rows[0][-2:] == ('sub-1', True)


@patch('sm.rest.segmentation_manager.delete_segmentation_job')
def test_delete_job_delegates_to_delete_segmentation_job(delete_job):
    db = FakeDB()
    mgr = _make_mgr(db)

    result = mgr.delete_job('ds', 7)

    assert result == {'job_id': 7, 'ds_id': 'ds'}
    delete_job.assert_called_once_with('ds', 7, db)


@patch('sm.rest.segmentation_manager.save_segmentation_result', side_effect=RuntimeError('boom'))
def test_failed_save_marks_job_failed_and_reraises(_save):
    db = FakeDB()
    mgr = _make_mgr(db)
    mgr._send_failure_email = MagicMock()
    mgr._send_success_email = MagicMock()

    with pytest.raises(RuntimeError, match='boom'):
        mgr.handle_segmentation_callback(7, 'ds', 'ok', result={}, email='a@b.c')

    assert len(db.alter_calls) == 1
    sql, params = db.alter_calls[0]
    assert "status = 'FAILED'" in sql
    assert params == ('boom', 7)
    mgr._send_failure_email.assert_called_once_with('ds', 'a@b.c', 'boom')
    mgr._send_success_email.assert_not_called()
