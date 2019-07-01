from datetime import datetime
import json
from unittest.mock import MagicMock
from pytest import fixture

from sm.engine.dataset import DatasetStatus, Dataset, generate_ds_config
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.daemon_action import DaemonAction, DaemonActionStage
from sm.engine.tests.util import sm_config, test_db, metadata, ds_config


@fixture
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB(sm_config['db'])
    db.insert(('INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
               'is_public) '
               'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)'),
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(metadata), json.dumps(ds_config), DatasetStatus.FINISHED,
                     True)])


def test_generate_ds_config(metadata, ds_config):
    generated_config = generate_ds_config(metadata, ['HMDB-v4'], ["+H", "+Na", "+K", "[M]+"])

    assert generated_config == ds_config


def test_dataset_load_existing_ds_works(fill_db, metadata, ds_config):
    db = DB(sm_config['db'])
    upload_dt = datetime.strptime('2000-01-01 00:00:00', '%Y-%m-%d %H:%M:%S')
    ds_id = '2000-01-01'

    ds = Dataset.load(db, ds_id)

    assert ds.metadata == metadata
    ds_fields = {k: v for k, v in ds.__dict__.items() if not k.startswith('_')}
    assert ds_fields == dict(
        id=ds_id, name='ds_name', input_path='input_path', upload_dt=upload_dt,
        metadata=metadata, config=ds_config, status=DatasetStatus.FINISHED, is_public=True,
        ion_img_storage_type='fs'
    )


def test_dataset_save_overwrite_ds_works(fill_db, metadata, ds_config):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, metadata, ds_config)

    ds.save(db, es_mock)

    assert ds == Dataset.load(db, ds_id)
    es_mock.sync_dataset.assert_called_once_with(ds_id)


def test_dataset_update_status_works(fill_db, metadata, ds_config):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(id=ds_id, name='ds_name', input_path='input_path', upload_dt=upload_dt,
                 metadata=metadata, config=ds_config, status=DatasetStatus.ANNOTATING)

    ds.set_status(db, es_mock, DatasetStatus.FINISHED)

    assert DatasetStatus.FINISHED == Dataset.load(db, ds_id).status


def test_dataset_notify_update_works(fill_db, metadata, ds_config):
    status_queue_mock = MagicMock(spec=QueuePublisher)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(id=ds_id, name='ds_name', input_path='input_path', upload_dt=upload_dt,
                 metadata=metadata, config=ds_config, status=DatasetStatus.FINISHED)

    ds.notify_update(status_queue_mock, DaemonAction.ANNOTATE, DaemonActionStage.FINISHED)

    status_queue_mock.publish.assert_called_once_with({'ds_id': ds_id,
                                                       'status': DatasetStatus.FINISHED,
                                                       'action': DaemonAction.ANNOTATE,
                                                       'stage': DaemonActionStage.FINISHED})


def test_dataset_to_queue_message_works(metadata, ds_config):
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(id=ds_id, name='ds_name', input_path='input_path', upload_dt=upload_dt,
                 metadata=metadata, config=ds_config, status=DatasetStatus.QUEUED)

    msg = ds.to_queue_message()

    assert {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path'} == msg
