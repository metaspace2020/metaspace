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
    assert result == {'restarted_count': 0, 'abandoned_count': 0}
    args, _ = db.select.call_args
    assert "'RUNNING_STATS'" in args[0]


@patch('sm.rest.experiment_manager.threading.Thread')
def test_restart_pending_jobs_abandons_stale_runs_instead_of_republishing(thread_cls):
    """A run left in flight for longer than the cutoff (e.g. the daemon was
    OOM-killed and the host rebooted) is marked FAILED rather than re-queued,
    so a restart never replays an old crash. Fresh rows are republished as before."""
    db = MagicMock()
    # (id, run_generation, stale) — staleness is computed in SQL against the cutoff.
    db.select.return_value = [('exp-old', 2, True), ('exp-new', 3, False)]
    mgr = ExperimentManager.__new__(ExperimentManager)
    mgr._db = db
    mgr._sm_config = {'image_storage': {'bucket': 'b'}}

    result = mgr.restart_pending_jobs()

    assert result == {'restarted_count': 1, 'abandoned_count': 1}
    # Cutoff is passed to the query, not hard-coded into the SQL string.
    select_args, select_kwargs = db.select.call_args
    assert 'run_started_at' in select_args[0]
    assert select_kwargs['params'] == (ExperimentManager._RESTART_MAX_AGE_S,)
    # Stale row is failed with an explanatory error, pinned to its generation.
    db.alter.assert_called_once()
    alter_args, alter_kwargs = db.alter.call_args
    assert "run_status='FAILED'" in alter_args[0]
    assert alter_kwargs['params'][1:] == ('exp-old', 2)
    assert 'abandoned' in alter_kwargs['params'][0]
    # Only the fresh row is handed to the sequential republish worker.
    _, thread_kwargs = thread_cls.call_args
    assert thread_kwargs['args'] == ([('exp-new', 3)],)


@patch('sm.rest.experiment_manager.transaction_context', create=True)
def test_handle_callback_writes_results_and_status_in_one_transaction(tx):
    """Stage 3 fetches results as soon as the run reports FINISHED. The old rows
    are deleted and the new ones inserted; without a transaction a concurrent
    read lands in the empty window and the UI shows no results until reload."""
    parent = MagicMock()
    db = MagicMock()
    parent.attach_mock(db, 'db')
    db.select_one.side_effect = [(3,), (None,)]  # current run_generation, then existing run_qc
    cm = MagicMock()
    cm.__enter__ = MagicMock(side_effect=lambda *a: parent.tx_enter())
    cm.__exit__ = MagicMock(side_effect=lambda *a: parent.tx_exit())
    tx.return_value = cm
    mgr = _make_mgr(db)

    mgr.handle_experiment_callback(
        'exp-1',
        3,
        'FINISHED',
        result={'results': [{'ion_id': 1, 'label_group_name': 'g'}], 'run_qc': {}},
    )

    names = [c[0] for c in parent.mock_calls]
    assert 'tx_enter' in names and 'tx_exit' in names
    enter, exit_ = names.index('tx_enter'), names.index('tx_exit')
    writes = [i for i, n in enumerate(names) if n in ('db.alter', 'db.insert')]
    assert writes, 'expected result/status writes'
    assert all(enter < i < exit_ for i in writes), f'writes outside the transaction: {names}'
    # DELETE old rows, INSERT new rows, then flip run_status — all inside.
    sqls = [c[1][0] for c in db.mock_calls if c[0] in ('alter', 'insert')]
    assert 'DELETE FROM experiment_result' in sqls[0]
    assert 'INSERT INTO experiment_result' in sqls[1]
    assert "run_status='FINISHED'" in sqls[2]
