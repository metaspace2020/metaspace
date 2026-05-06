"""Unit tests for sm.rest.experiment + ExperimentManager.

These tests mock the DB and the SM_UPDATE queue publisher, so they don't
need a live Postgres / RabbitMQ. They cover the contract guarantees of
the simplified single-phase 3-table flow:

* ``POST /run`` flips ``experiment.run_status`` to ``PREPARING`` and
  publishes an ``EXPERIMENT_STATS`` message carrying ``experiment_id``
  and ``run_generation``.
* ``POST /callback`` with ``status='FINISHED'`` writes ``experiment_result``
  rows (carrying ``ion_id``) and updates the ``experiment`` row to
  ``FINISHED / DONE / inferred_test / run_qc``.
* ``POST /callback`` with ``status='FAILED'`` updates the row to
  ``FAILED`` and stores the error message.
* A callback whose ``run_generation`` does not match the row's current
  generation is treated as stale and ignored.
"""
# pylint: disable=no-value-for-parameter
# (handlers are wrapped by the @sm_modify_experiment decorator which injects
# `experiment_man` and `params`; pylint can't see through the decorator.)
import contextlib
import gzip
import json
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from sm.rest import experiment


# --- helpers ---------------------------------------------------------------


@contextlib.contextmanager
def _patch_bottle_request(req_doc):
    with patch('sm.rest.experiment.bottle.request') as request_mock:
        request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()
        yield req_doc


class FakeDB:
    """Tiny in-memory stand-in for sm.engine.db.DB.

    Records every ``alter`` call and answers ``select_one`` for the
    ``run_generation`` lookup performed by the callback handler.
    """

    def __init__(self):
        self.alter_calls = []  # list[(sql, params)]
        self.run_status = None  # last status seen on experiment
        self.run_stage = None
        self.run_inferred_test = None
        self.run_error = None
        self.run_qc = None
        self.run_generation_db = 1  # what `SELECT run_generation FROM experiment` returns
        self.experiment_results = []  # list[tuple] -- INSERT params

    def alter(self, sql, params=None):
        self.alter_calls.append((sql, params))
        upper = sql.upper()
        if 'UPDATE EXPERIMENT' in upper and "RUN_STATUS='PREPARING'" in upper:
            self.run_status = 'PREPARING'
            self.run_stage = 'PREP'
            self.run_error = None
        elif 'UPDATE EXPERIMENT' in upper and "RUN_STATUS='FINISHED'" in upper:
            self.run_status = 'FINISHED'
            self.run_stage = 'DONE'
            self.run_inferred_test = params[0]
            self.run_qc = params[1]
        elif 'UPDATE EXPERIMENT' in upper and "RUN_STATUS='FAILED'" in upper:
            self.run_status = 'FAILED'
            self.run_error = params[0]
        elif 'INSERT INTO EXPERIMENT_RESULT' in upper:
            self.experiment_results.append(params)

    def select(self, sql, params=None):  # pylint: disable=unused-argument,no-self-use
        return []

    def select_one(self, sql, params=None):  # pylint: disable=unused-argument
        if 'SELECT run_generation FROM experiment' in sql:
            return (self.run_generation_db,)
        return None


@pytest.fixture()
def fake_db():
    return FakeDB()


@pytest.fixture(autouse=True)
def patch_db_and_publisher(fake_db):
    """Wire FakeDB into the manager and stub out RabbitMQ publish."""
    publisher = MagicMock()
    with patch('sm.rest.experiment.DB', return_value=fake_db), patch(
        'sm.rest.experiment_manager.SMConfig.get_conf',
        return_value={
            'rabbitmq': {'host': 'h', 'user': 'u', 'password': 'p'},
            'image_storage': {'bucket': 'sm-test-bucket'},
        },
    ), patch('sm.rest.experiment_manager.QueuePublisher', return_value=publisher) as publisher_cls:
        yield {'publisher': publisher, 'publisher_cls': publisher_cls, 'db': fake_db}


# --- /run ------------------------------------------------------------------


def test_run_endpoint_marks_preparing_and_publishes(patch_db_and_publisher):
    """POST /run sets run_status=PREPARING and publishes the right message."""
    fake_db = patch_db_and_publisher['db']
    publisher = patch_db_and_publisher['publisher']

    body = {'experiment_id': 'exp-uuid-1', 'run_generation': 1}
    with _patch_bottle_request(body):
        resp = experiment.run_experiment()

    assert resp['status'] == 'success'
    assert resp['experiment_id'] == 'exp-uuid-1'
    assert resp['run_generation'] == 1
    assert fake_db.run_status == 'PREPARING'
    assert fake_db.run_stage == 'PREP'

    publisher.publish.assert_called_once()
    msg = publisher.publish.call_args[0][0]
    assert msg['action'] == 'experiment_stats'
    assert msg['experiment_id'] == 'exp-uuid-1'
    assert msg['run_generation'] == 1
    assert 'phase' not in msg


# --- /callback (FINISHED) --------------------------------------------------


def test_callback_finished_writes_results_and_updates_experiment(patch_db_and_publisher):
    """A FINISHED callback inserts result rows keyed by ion_id and updates the row."""
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 1

    result_payload = {
        'inferred_test': 'MOCKED',
        'results': [
            {
                'ion_id': 101,
                'label_group_name': 'control_vs_treated',
                'lfc': 1.5,
                'p_value': 0.01,
                'fdr': 0.03,
                'detection_rate_a': 1.0,
                'detection_rate_b': 0.8,
                'n_a': 4,
                'n_b': 4,
            },
            {
                'ion_id': 102,
                'label_group_name': 'control_vs_treated',
                'lfc': 1.2,
                'p_value': 0.02,
                'fdr': 0.06,
                'detection_rate_a': 1.0,
                'detection_rate_b': 0.65,
                'n_a': 4,
                'n_b': 4,
            },
        ],
        'run_qc': {'samples': [{'sampleId': 's0', 'tic': 1000.0}]},
    }
    body = {
        'experiment_id': 'exp-uuid-1',
        'run_generation': 1,
        'status': 'FINISHED',
        'result': result_payload,
    }
    with _patch_bottle_request(body):
        resp = experiment.experiment_callback()

    assert resp['status'] == 'success'
    assert resp['experiment_id'] == 'exp-uuid-1'
    assert len(fake_db.experiment_results) == 2
    # INSERT params: (experiment_id, run_generation, ion_id, label_group_name, ...)
    for params in fake_db.experiment_results:
        assert params[0] == 'exp-uuid-1'
        assert params[1] == 1
    assert fake_db.experiment_results[0][2] == 101
    assert fake_db.experiment_results[1][2] == 102
    assert fake_db.run_status == 'FINISHED'
    assert fake_db.run_stage == 'DONE'
    assert fake_db.run_inferred_test == 'MOCKED'
    assert fake_db.run_qc is not None  # Json adapter wrapped value


# --- /callback (FAILED) ----------------------------------------------------


def test_callback_failed_records_error(patch_db_and_publisher):
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 1

    body = {
        'experiment_id': 'exp-uuid-1',
        'run_generation': 1,
        'status': 'FAILED',
        'error': 'boom',
    }
    with _patch_bottle_request(body):
        resp = experiment.experiment_callback()

    assert resp['status'] == 'success'
    assert fake_db.run_status == 'FAILED'
    assert fake_db.run_error == 'boom'


# --- /callback (stale) -----------------------------------------------------


def test_callback_with_stale_generation_is_ignored(patch_db_and_publisher):
    """A callback whose run_generation < the row's generation is ignored."""
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 2  # row already moved on to gen 2

    body = {
        'experiment_id': 'exp-uuid-1',
        'run_generation': 1,
        'status': 'FINISHED',
        'result': {'inferred_test': 'MOCKED', 'results': []},
    }
    with _patch_bottle_request(body):
        resp = experiment.experiment_callback()

    # Endpoint still returns a success response shape, but the row is untouched.
    assert resp['status'] == 'success'
    assert fake_db.run_status is None  # no UPDATE issued
    assert fake_db.experiment_results == []


# --- intensity blob write + GET endpoint -----------------------------------


def test_callback_finished_writes_intensity_blob_to_s3(patch_db_and_publisher):
    """A FINISHED callback uploads intensity_rows as gzipped JSON to S3."""
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 1

    captured = {}

    def fake_put_object(Key, Body):  # pylint: disable=invalid-name
        captured['Key'] = Key
        captured['Body'] = Body
        return MagicMock()

    bucket_obj = MagicMock()
    bucket_obj.put_object.side_effect = fake_put_object
    s3_resource = MagicMock()
    s3_resource.Bucket.return_value = bucket_obj

    body = {
        'experiment_id': 'exp-uuid-1',
        'run_generation': 1,
        'status': 'FINISHED',
        'result': {
            'inferred_test': 'MOCKED',
            'results': [],
            'intensity_rows': [
                {'ion_id': 7, 'region_key': 'r-a', 'intensity': 1.5},
                {'ion_id': 7, 'region_key': 'r-b', 'intensity': 2.5},
            ],
        },
    }
    with patch(
        'sm.rest.experiment_manager.get_s3_resource', return_value=s3_resource
    ), _patch_bottle_request(body):
        resp = experiment.experiment_callback()

    assert resp['status'] == 'success'
    assert captured['Key'] == 'experiments/exp-uuid-1/1/intensities.json.gz'
    decoded = json.loads(gzip.decompress(captured['Body']).decode('utf-8'))
    assert decoded == body['result']['intensity_rows']


def test_get_ion_intensities_filters_and_enriches(patch_db_and_publisher):
    """GET endpoint reads + filters the blob and joins region metadata."""
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 3

    # Patch select() to return one experiment_dataset row with regions JSONB.
    regions = [
        {
            'regionKey': 'r-a',
            'metadata': {
                'condition': 'control',
                'sampleId': 's1',
                'biologicalReplicateId': 'b1',
            },
        },
        {
            'regionKey': 'r-b',
            'metadata': {
                'condition': 'treated',
                'sampleId': 's2',
                'biologicalReplicateId': 'b2',
            },
        },
    ]
    fake_db.select = lambda sql, params=None: [(regions,)] if 'experiment_dataset' in sql else []

    blob_rows = [
        {'ion_id': 7, 'region_key': 'r-a', 'intensity': 1.5},
        {'ion_id': 7, 'region_key': 'r-b', 'intensity': 2.5},
        {'ion_id': 7, 'region_key': 'r-orphan', 'intensity': 9.0},
        {'ion_id': 99, 'region_key': 'r-a', 'intensity': 100.0},
    ]
    blob = BytesIO()
    with gzip.GzipFile(fileobj=blob, mode='wb') as gz:  # pylint: disable=invalid-name
        gz.write(json.dumps(blob_rows).encode('utf-8'))
    body_stream = MagicMock()
    body_stream.read.return_value = blob.getvalue()
    s3_obj = MagicMock()
    s3_obj.get.return_value = {'Body': body_stream}
    s3_resource = MagicMock()
    s3_resource.Object.return_value = s3_obj

    with patch('sm.rest.experiment_manager.get_s3_resource', return_value=s3_resource):
        resp = experiment.get_ion_intensities('exp-uuid-1', 7)

    s3_resource.Object.assert_called_with(
        'sm-test-bucket', 'experiments/exp-uuid-1/3/intensities.json.gz'
    )
    rows = resp.body['rows']
    assert len(rows) == 3
    by_key = {r['regionKey']: r for r in rows}
    assert by_key['r-a'] == {
        'regionKey': 'r-a',
        'intensity': 1.5,
        'condition': 'control',
        'sampleId': 's1',
        'biologicalReplicateId': 'b1',
    }
    assert by_key['r-b']['condition'] == 'treated'
    assert by_key['r-orphan']['condition'] is None


def test_get_ion_intensities_missing_blob_returns_empty(patch_db_and_publisher):
    """If the S3 object is missing, the endpoint returns rows=[] (no 500)."""
    fake_db = patch_db_and_publisher['db']
    fake_db.run_generation_db = 1
    fake_db.select = lambda sql, params=None: []

    s3_obj = MagicMock()
    s3_obj.get.side_effect = ClientError(
        {'Error': {'Code': 'NoSuchKey', 'Message': 'nope'}}, 'GetObject'
    )
    s3_resource = MagicMock()
    s3_resource.Object.return_value = s3_obj

    with patch('sm.rest.experiment_manager.get_s3_resource', return_value=s3_resource):
        resp = experiment.get_ion_intensities('exp-uuid-1', 7)

    assert resp.body == {'rows': []}
