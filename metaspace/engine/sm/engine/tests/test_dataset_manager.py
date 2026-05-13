from unittest.mock import MagicMock, patch


@patch('sm.engine.daemons.dataset_manager.submit_experiment_stats_only_job')
def test_run_experiment_stats_only_submits_job(submit):
    from sm.engine.daemons.dataset_manager import DatasetManager

    dm = DatasetManager.__new__(DatasetManager)
    dm._db = MagicMock()
    dm.logger = MagicMock()

    msg = {
        'experiment_id': 'exp-1',
        'run_generation': 3,
        'intensity_blob_s3_key': 'experiments/exp-1/3/intensities.json.gz',
        'filter': {'fdrMax': 0.1},
        'excluded_samples': ['s1'],
    }
    dm.run_experiment_stats_only(msg)

    submit.assert_called_once_with(
        experiment_id='exp-1',
        run_generation=3,
        intensity_blob_s3_key='experiments/exp-1/3/intensities.json.gz',
        filter={'fdrMax': 0.1},
        excluded_samples=['s1'],
        db=dm._db,
    )


@patch(
    'sm.engine.daemons.dataset_manager.submit_experiment_stats_only_job',
    side_effect=Exception('boom'),
)
def test_run_experiment_stats_only_marks_failed_on_exception(_submit):
    from sm.engine.daemons.dataset_manager import DatasetManager

    dm = DatasetManager.__new__(DatasetManager)
    dm._db = MagicMock()
    dm.logger = MagicMock()
    dm.run_experiment_stats_only(
        {
            'experiment_id': 'exp-1',
            'run_generation': 3,
            'intensity_blob_s3_key': 'k',
            'filter': {},
            'excluded_samples': [],
        }
    )
    args, _ = dm._db.alter.call_args
    assert "run_status='FAILED'" in args[0]
