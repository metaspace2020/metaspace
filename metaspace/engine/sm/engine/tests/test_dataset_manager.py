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


def _failed_email_body(**kwargs):
    from sm.engine.daemons.dataset_manager import DatasetManager

    dm = DatasetManager.__new__(DatasetManager)
    dm.fetch_ds_metadata = MagicMock(return_value=('my ds', {}))
    dm._send_email = MagicMock()
    dm.send_failed_email({'ds_id': 'ds1', 'email': 'a@b.c'}, **kwargs)
    dm._send_email.assert_called_once()
    return dm._send_email.call_args.args[2]


def test_send_failed_email_with_reason_replaces_imzml_paragraph():
    body = _failed_email_body(
        traceback='cost $12.30 over $10.00', reason='Processing was stopped because it was big.'
    )
    assert 'Processing was stopped because it was big.' in body
    assert 'imzML' not in body and '$' not in body
    assert 'contact@metaspace2020.org' in body


def test_send_failed_email_keeps_imzml_paragraph_without_reason():
    body = _failed_email_body(traceback='Traceback: bad ibd')
    assert 'imzML' in body and 'Traceback: bad ibd' in body
