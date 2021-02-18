from datetime import datetime
import json
from unittest.mock import MagicMock
from pytest import fixture

from sm.engine.dataset import DatasetStatus, Dataset, generate_ds_config
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from .utils import create_test_molecular_db, create_test_ds


@fixture
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB()
    db.insert(
        (
            'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
            'status_update_dt, is_public) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'
        ),
        rows=[
            (
                ds_id,
                'ds_name',
                'input_path',
                upload_dt,
                json.dumps(metadata),
                json.dumps(ds_config),
                DatasetStatus.FINISHED,
                upload_dt,
                True,
            )
        ],
    )
    create_test_molecular_db()


def test_generate_ds_config(fill_db, metadata, ds_config):
    generated_config = generate_ds_config(
        metadata, moldb_ids=[0], adducts=["+H", "+Na", "+K", "[M]+"]
    )

    assert generated_config == ds_config


def test_dataset_load_existing_ds_works(fill_db, metadata, ds_config):
    db = DB()
    upload_dt = datetime.strptime('2000-01-01 00:00:00', '%Y-%m-%d %H:%M:%S')
    ds_id = '2000-01-01'

    ds = Dataset.load(db, ds_id)

    assert ds.metadata == metadata
    ds_fields = {k: v for k, v in ds.__dict__.items() if not k.startswith('_')}
    assert ds_fields == dict(
        id=ds_id,
        name='ds_name',
        input_path='input_path',
        upload_dt=upload_dt,
        metadata=metadata,
        config=ds_config,
        status=DatasetStatus.FINISHED,
        status_update_dt=upload_dt,
        is_public=True,
    )


def test_dataset_save_overwrite_ds_works(fill_db, metadata, ds_config):
    db = DB()
    es_mock = MagicMock(spec=ESExporter)
    ds = create_test_ds()

    ds.save(db, es_mock)

    assert ds == Dataset.load(db, ds.id)
    es_mock.sync_dataset.assert_called_once_with(ds.id)


def test_dataset_update_status_works(fill_db, metadata, ds_config):
    db = DB()
    es_mock = MagicMock(spec=ESExporter)

    ds = create_test_ds(status=DatasetStatus.ANNOTATING)

    ds.set_status(db, es_mock, DatasetStatus.FINISHED)

    assert DatasetStatus.FINISHED == Dataset.load(db, ds.id).status


def test_dataset_to_queue_message_works(metadata, ds_config):
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(
        id=ds_id,
        name='ds_name',
        input_path='input_path',
        upload_dt=upload_dt,
        metadata=metadata,
        config=ds_config,
        status=DatasetStatus.QUEUED,
    )

    msg = ds.to_queue_message()

    assert {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path'} == msg
