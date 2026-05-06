"""Unit tests for sm.engine.postprocessing.experiment_wrapper.

The wrapper now loads experiment definition from the simplified 3-table
schema and posts a rich JSON payload (no S3 staging, no ``phase`` field).
We mock the DB and ``requests.post``.
"""
from unittest.mock import MagicMock, patch

from sm.engine.postprocessing.experiment_wrapper import submit_experiment_job


class _FakeDB:
    """Minimal in-memory DB for these tests."""

    def __init__(self, exp_row, ds_rows):
        self._exp_row = exp_row
        self._ds_rows = ds_rows

    def select_one(self, sql, params=None):  # pylint: disable=unused-argument
        return self._exp_row

    def select(self, sql, params=None):  # pylint: disable=unused-argument
        return self._ds_rows


@patch('sm.engine.postprocessing.experiment_wrapper.build_prep_block')
@patch('sm.engine.postprocessing.experiment_wrapper.requests.post')
@patch('sm.engine.postprocessing.experiment_wrapper.SMConfig.get_conf')
def test_submit_experiment_job_posts_full_payload(mock_conf, mock_post, mock_prep):
    mock_conf.return_value = {
        'services': {
            'segmentation': 'http://image-seg:9877',
            'experiment_callback': 'http://api:5123/v1/experiment/callback',
        }
    }
    mock_post.return_value = MagicMock(status_code=200)
    mock_prep.return_value = {
        'samples': [{'sampleId': 's0', 'datasetId': 'ds-1', 'tic': 0.0}],
        'intensities': {'s0': {}},
        'ions_total': 0,
        'filterChain': [{'name': 'All annotated ions', 'count': 0, 'droppedFromPrev': 0}],
    }

    label_groups = [
        {
            'name': 'control_vs_treated',
            'samplesA': ['s0', 's1'],
            'samplesB': ['s2', 's3'],
        }
    ]
    excluded = ['sX']
    filters = {'fdr': 0.1}
    regions = [
        {
            'regionKey': 'r0',
            'sourceKind': 'roi',
            'roiId': 7,
            'segmentationId': None,
            'labelGroupName': 'control_vs_treated',
            'metadata': {'sampleId': 's0'},
        }
    ]
    db = _FakeDB(
        exp_row=(label_groups, excluded, filters),
        ds_rows=[('ds-1', 'roi', regions)],
    )

    submit_experiment_job('exp-1', run_generation=3, email='u@e.com', db=db)

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == 'http://image-seg:9877/experiment/run'

    body = kwargs['json']
    assert body['experiment_id'] == 'exp-1'
    assert body['run_generation'] == 3
    assert 'phase' not in body
    assert body['callback_url'] == 'http://api:5123/v1/experiment/callback'
    assert body['label_groups'] == label_groups
    assert body['excluded_samples'] == excluded
    assert body['filters'] == filters
    assert body['email'] == 'u@e.com'

    assert len(body['datasets']) == 1
    ds = body['datasets'][0]
    assert ds['dataset_id'] == 'ds-1'
    assert ds['region_source'] == 'roi'
    assert ds['regions'] == regions

    assert body['prep'] == mock_prep.return_value
    mock_prep.assert_called_once()
    prep_args, _ = mock_prep.call_args
    # (db, datasets, filters)
    assert prep_args[0] is db
    assert prep_args[1][0]['dataset_id'] == 'ds-1'
    assert prep_args[2] == filters


@patch('sm.engine.postprocessing.experiment_wrapper.build_prep_block')
@patch('sm.engine.postprocessing.experiment_wrapper.requests.post')
@patch('sm.engine.postprocessing.experiment_wrapper.SMConfig.get_conf')
def test_submit_experiment_job_uses_defaults_when_services_missing(mock_conf, mock_post, mock_prep):
    mock_conf.return_value = {}
    mock_post.return_value = MagicMock(status_code=200)
    mock_prep.return_value = {'samples': [], 'intensities': {}, 'ions_total': 0, 'filterChain': []}

    db = _FakeDB(exp_row=([], [], {}), ds_rows=[])
    submit_experiment_job('exp-2', run_generation=0, db=db)

    args, kwargs = mock_post.call_args
    assert args[0] == 'http://image-segmentation:9877/experiment/run'
    body = kwargs['json']
    assert body['callback_url'] == 'http://api:5123/v1/experiment/callback'
    assert body['datasets'] == []
    assert 'email' not in body
    assert 'prep' in body
