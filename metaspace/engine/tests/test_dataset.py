from datetime import datetime
import json
from unittest.mock import MagicMock
from pytest import fixture

from sm.engine import DatasetStatus, Dataset, DB, ESExporter, QueuePublisher
from sm.engine.queue import SM_DS_STATUS
from sm.engine.tests.util import pysparkling_context, sm_config, ds_config, test_db


@fixture
def fill_db(test_db, sm_config, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    meta = {"meta": "data"}
    db = DB(sm_config['db'])
    db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s, %s, %s)',
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(meta), json.dumps(ds_config), DatasetStatus.FINISHED)])


def test_dataset_load_existing_ds_works(fill_db, sm_config, ds_config):
    db = DB(sm_config['db'])
    upload_dt = datetime.strptime('2000-01-01 00:00:00', "%Y-%m-%d %H:%M:%S")
    ds_id = '2000-01-01'
    meta = {"meta": "data"}

    ds = Dataset.load(db, ds_id)

    assert (ds.id == ds_id and ds.name == 'ds_name' and ds.input_path == 'input_path' and
            ds.upload_dt == upload_dt and ds.meta == meta and ds.config == ds_config and
            ds.status == DatasetStatus.FINISHED)


def test_dataset_save_overwrite_ds_works(fill_db, sm_config, ds_config):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)
    status_queue_mock = MagicMock(spec=QueuePublisher)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, {}, ds_config)

    ds.save(db, es_mock, status_queue_mock)

    assert ds == Dataset.load(db, ds_id)
    es_mock.sync_dataset.assert_called_once_with(ds_id)
    status_queue_mock.publish.assert_called_with({'ds_id': ds_id, 'status': DatasetStatus.NEW})


def test_dataset_update_status_works(fill_db, sm_config, ds_config):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)
    status_queue_mock = MagicMock(spec=QueuePublisher)

    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, {}, ds_config, DatasetStatus.INDEXING)

    ds.set_status(db, es_mock, status_queue_mock, DatasetStatus.FINISHED)

    assert DatasetStatus.FINISHED == Dataset.load(db, ds_id).status
    status_queue_mock.publish.assert_called_once_with({'ds_id': ds_id, 'status': DatasetStatus.FINISHED})


def test_dataset_to_queue_message_works():
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    meta = {'Submitted_By': {'Submitter': {'Email': 'user@example.com'}}, 'metaspace_options': {}}
    ds = Dataset(ds_id, 'ds_name', 'input_path', upload_dt, meta, ds_config)

    msg = ds.to_queue_message()

    assert {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
            'user_email': 'user@example.com'} == msg
