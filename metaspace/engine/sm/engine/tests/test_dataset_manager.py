from unittest.mock import MagicMock, patch


@patch('sm.engine.daemons.dataset_manager.submit_experiment_stats_job')
def test_run_experiment_stats_submits_job(submit):
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
    dm.run_experiment_stats(msg)

    submit.assert_called_once_with(
        experiment_id='exp-1',
        run_generation=3,
        intensity_blob_s3_key='experiments/exp-1/3/intensities.json.gz',
        filter={'fdrMax': 0.1},
        excluded_samples=['s1'],
        db=dm._db,
    )


@patch(
    'sm.engine.daemons.dataset_manager.submit_experiment_stats_job',
    side_effect=Exception('boom'),
)
def test_run_experiment_stats_marks_failed_on_exception(_submit):
    from sm.engine.daemons.dataset_manager import DatasetManager

    dm = DatasetManager.__new__(DatasetManager)
    dm._db = MagicMock()
    dm.logger = MagicMock()
    dm.run_experiment_stats(
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


@patch('sm.engine.daemons.dataset_manager.del_segmentation_job_images')
@patch('sm.engine.daemons.dataset_manager.delete_ion_thumbnail')
@patch('sm.engine.daemons.dataset_manager.del_optical_image')
@patch('sm.engine.daemons.dataset_manager.del_jobs')
@patch('sm.engine.daemons.dataset_manager.del_diagnostics')
def test_dataset_delete_removes_job_images(
    del_diagnostics, _del_jobs, _del_optical, _del_thumb, del_job_images
):
    from sm.engine.daemons.dataset_manager import DatasetManager

    dm = DatasetManager.__new__(DatasetManager)
    dm._db = MagicMock()
    dm._es = MagicMock()
    dm.logger = MagicMock()
    ds = MagicMock()
    ds.id = 'ds-1'

    order = MagicMock()
    order.attach_mock(del_diagnostics, 'del_diagnostics')
    order.attach_mock(del_job_images, 'del_job_images')

    dm.delete(ds)

    assert [c[0] for c in order.mock_calls] == ['del_diagnostics', 'del_job_images']
    del_job_images.assert_called_once_with('ds-1', dm._db)
