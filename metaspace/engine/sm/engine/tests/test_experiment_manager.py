"""Unit tests for :class:`sm.rest.experiment_manager.ExperimentManager`."""

from unittest.mock import MagicMock, patch

from sm.engine.daemons.actions import DaemonAction
from sm.rest.experiment_manager import ExperimentManager


def _make_mgr(db):
    """Bypass ``__init__`` (which loads SMConfig) for unit testing."""
    mgr = ExperimentManager.__new__(ExperimentManager)
    mgr._db = db
    mgr._sm_config = {'image_storage': {'bucket': 'b'}}
    mgr.ses = None
    return mgr


@patch.object(ExperimentManager, '_create_update_queue_publisher')
@patch.object(ExperimentManager, '_blob_exists', return_value=True)
def test_run_stats_only_publishes_when_blob_present(_blob, _make_pub):
    db = MagicMock()
    pub = MagicMock()
    _make_pub.return_value = pub
    mgr = _make_mgr(db)

    result = mgr.run_stats(
        experiment_id='exp-1',
        run_generation=3,
        filter={'fdrMax': 0.1},
        excluded_samples=['s1'],
    )

    assert result == {'experiment_id': 'exp-1', 'run_generation': 3}
    db.alter.assert_called_once()
    args, _ = db.alter.call_args
    assert "run_status='RUNNING_STATS'" in args[0]
    pub.publish.assert_called_once()
    msg = pub.publish.call_args[0][0]
    assert msg['action'] == DaemonAction.EXPERIMENT_STATS
    assert msg['experiment_id'] == 'exp-1'
    assert msg['run_generation'] == 3
    assert msg['intensity_blob_s3_key'] == 'experiments/exp-1/3/intensities.json.gz'
    assert msg['filter'] == {'fdrMax': 0.1}
    assert msg['excluded_samples'] == ['s1']


@patch.object(ExperimentManager, 'run_prep')
@patch.object(ExperimentManager, '_create_update_queue_publisher')
@patch.object(ExperimentManager, '_blob_exists', return_value=False)
def test_run_stats_only_falls_back_when_blob_missing(_blob, _make_pub, run_full):
    db = MagicMock()
    mgr = _make_mgr(db)
    run_full.return_value = {'experiment_id': 'exp-1', 'run_generation': 4}

    result = mgr.run_stats(
        experiment_id='exp-1',
        run_generation=3,
        filter={},
        excluded_samples=[],
    )

    run_full.assert_called_once_with('exp-1', 4)
    _make_pub.assert_not_called()
    assert result == {'experiment_id': 'exp-1', 'run_generation': 4}


@patch.object(ExperimentManager, '_wait_for_run_settled')
@patch.object(ExperimentManager, '_create_update_queue_publisher')
def test_sequential_republish_uses_stats_only_for_running_stats(_make_pub, _wait):
    db = MagicMock()
    pub = MagicMock()
    _make_pub.return_value = pub
    mgr = ExperimentManager.__new__(ExperimentManager)
    mgr._db = db
    mgr._sm_config = {'image_storage': {'bucket': 'b'}}

    # Row reports RUNNING_STATS + persisted filter/excluded.
    db.select_one.return_value = ('RUNNING_STATS', 3, {'fdrMax': 0.1}, ['s1'])

    mgr._sequential_republish_worker([('exp-1', 3)])

    pub.publish.assert_called_once()
    msg = pub.publish.call_args[0][0]
    assert msg['action'] == DaemonAction.EXPERIMENT_STATS
    assert msg['experiment_id'] == 'exp-1'
    assert msg['run_generation'] == 3
    assert msg['intensity_blob_s3_key'] == 'experiments/exp-1/3/intensities.json.gz'
    assert msg['filter'] == {'fdrMax': 0.1}
    assert msg['excluded_samples'] == ['s1']
    _wait.assert_called_once_with('exp-1', 3)


@patch.object(ExperimentManager, '_wait_for_run_settled')
@patch.object(ExperimentManager, '_create_update_queue_publisher')
def test_sequential_republish_uses_full_run_for_preparing(_make_pub, _wait):
    db = MagicMock()
    pub = MagicMock()
    _make_pub.return_value = pub
    mgr = ExperimentManager.__new__(ExperimentManager)
    mgr._db = db
    mgr._sm_config = {'image_storage': {'bucket': 'b'}}

    db.select_one.return_value = ('PREPARING', 5, None, None)

    mgr._sequential_republish_worker([('exp-2', 5)])

    msg = pub.publish.call_args[0][0]
    assert msg['action'] == DaemonAction.EXPERIMENT_PREP
    assert msg['experiment_id'] == 'exp-2'
    assert msg['run_generation'] == 5
    assert 'filter' not in msg  # only stats-only carries filter/excluded


def test_restart_pending_jobs_selects_running_stats():
    """The SELECT should include RUNNING_STATS in its IN clause."""
    db = MagicMock()
    db.select.return_value = []
    mgr = ExperimentManager.__new__(ExperimentManager)
    mgr._db = db
    mgr._sm_config = {'image_storage': {'bucket': 'b'}}

    result = mgr.restart_pending_jobs()
    assert result == {'restarted_count': 0}
    args, _ = db.select.call_args
    assert "'RUNNING_STATS'" in args[0]
