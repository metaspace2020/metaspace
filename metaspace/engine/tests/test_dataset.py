from datetime import datetime
import json
from unittest.mock import MagicMock
from pytest import fixture

from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.tests.util import sm_config, test_db, metadata, ds_config


@fixture
def fill_db(test_db, sm_config, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB(sm_config['db'])
    db.insert(('INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
               'is_public, mol_dbs, adducts) '
               'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)'),
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(metadata), json.dumps(ds_config), DatasetStatus.FINISHED,
                     True, ['HMDB-v4'], ['+H', '+Na', '+K'])])


def test_config_field_generated(sm_config, metadata, ds_config):
    ds = Dataset(id='2000-01-01', name='ds_name', input_path='input_path', upload_dt=datetime.now(),
                 metadata=metadata, mol_dbs=['HMDB-v4'])

    assert ds.config == ds_config


def test_dataset_load_existing_ds_works(fill_db, sm_config, metadata, ds_config):
    db = DB(sm_config['db'])
    upload_dt = datetime.strptime('2000-01-01 00:00:00', '%Y-%m-%d %H:%M:%S')
    ds_id = '2000-01-01'

    ds = Dataset.load(db, ds_id)

    assert ds.metadata == metadata
    ds_fields = {k: v for k, v in ds.__dict__.items() if not k.startswith('_')}
    assert ds_fields == dict(
        id=ds_id, name='ds_name', input_path='input_path', upload_dt=upload_dt,
        config=ds_config, status=DatasetStatus.FINISHED, is_public=True,
        mol_dbs=['HMDB-v4'], adducts=['+H', '+Na', '+K'], ion_img_storage_type='fs'
    )


def test_dataset_save_overwrite_ds_works(fill_db, sm_config, metadata, ds_config):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)
    status_queue_mock = MagicMock(spec=QueuePublisher)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, metadata, mol_dbs=['HMDB'])

    ds.save(db, es_mock, status_queue_mock)

    assert ds == Dataset.load(db, ds_id)
    es_mock.sync_dataset.assert_called_once_with(ds_id)
    status_queue_mock.publish.assert_called_with({'ds_id': ds_id, 'status': DatasetStatus.QUEUED})


def test_dataset_update_status_works(fill_db, sm_config, metadata):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)
    status_queue_mock = MagicMock(spec=QueuePublisher)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, metadata, DatasetStatus.ANNOTATING, mol_dbs=['HMDB'])

    ds.set_status(db, es_mock, status_queue_mock, DatasetStatus.FINISHED)

    assert DatasetStatus.FINISHED == Dataset.load(db, ds_id).status
    status_queue_mock.publish.assert_called_once_with({'ds_id': ds_id, 'status': DatasetStatus.FINISHED})


def test_dataset_to_queue_message_works(metadata, ds_config):
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, metadata, mol_dbs=['HDMB'])

    msg = ds.to_queue_message()

    assert {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path'} == msg
