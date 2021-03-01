from itertools import product
from unittest.mock import call
from unittest.mock import patch, MagicMock
from datetime import datetime

from sm.engine.daemons.dataset_manager import DatasetManager
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.dataset import DatasetStatus, Dataset, generate_ds_config


def create_ds(
    ds_id='2000-01-01',
    ds_name='ds_name',
    input_path='input_path',
    upload_dt=None,
    metadata=None,
    status=DatasetStatus.QUEUED,
    moldbs_ids=None,
    adducts=None,
):
    upload_dt = upload_dt or datetime.now()
    moldbs_ids = moldbs_ids or [0]
    if not adducts:
        adducts = ['+H', '+Na', '+K', '[M]+']
    if not metadata:
        metadata = {
            'MS_Analysis': {
                'Polarity': 'Positive',
                'Analyzer': 'FTICR',
                'Detector_Resolving_Power': {'mz': 200, 'Resolving_Power': 140000},
            }
        }
    config = generate_ds_config(metadata, moldb_ids=moldbs_ids, adducts=adducts)
    return Dataset(
        id=ds_id,
        name=ds_name,
        input_path=input_path,
        upload_dt=upload_dt,
        metadata=metadata or {},
        config=config,
        status=status,
    )


def create_daemon_man(db=None, es=None, status_queue=None):
    db = db or DB()
    es_mock = es or MagicMock(spec=ESExporter)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)
    return DatasetManager(db=db, es=es_mock, status_queue=status_queue_mock)


class TestSMDaemonDatasetManager:
    @patch('sm.engine.daemons.dataset_manager.AnnotationJob')
    def test_annotate_ds(self, AnnotationJobMock, fill_db, metadata, ds_config):
        es_mock = MagicMock(spec=ESExporter)
        db = DB()
        manager = create_daemon_man(db=db, es=es_mock)

        ds_id = '2000-01-01'
        ds_name = 'ds_name'
        input_path = 'input_path'
        upload_dt = datetime.now()
        ds = create_ds(
            ds_id=ds_id,
            ds_name=ds_name,
            input_path=input_path,
            upload_dt=upload_dt,
            metadata=metadata,
        )

        manager.annotate(ds)

        DS_SEL = 'select name, input_path, upload_dt, metadata, config from dataset where id=%s'
        results = db.select_one(DS_SEL, params=(ds_id,))
        assert results[3] == metadata
        assert results[4] == ds_config
        # assert db.select_one(DS_SEL, params=(ds_id,)) == (ds_name, input_path, upload_dt, metadata, ds_config)

    def test_index_ds(self, fill_db, metadata):
        es_mock = MagicMock(spec=ESExporter)
        manager = create_daemon_man(es=es_mock)

        ds_id = '2000-01-01'
        moldb = fill_db["moldb"]
        ds = create_ds(ds_id=ds_id, moldbs_ids=[moldb.id], metadata=metadata)

        manager.index(ds)

        es_mock.delete_ds.assert_called_with(ds_id, delete_dataset=False)
        assert es_mock.index_ds.call_count == 1
        index_ds_kw_args = es_mock.index_ds.call_args[1]
        assert index_ds_kw_args.get('ds_id') == ds_id
        assert index_ds_kw_args.get('moldb').name == 'HMDB'
        assert index_ds_kw_args.get('moldb').version == 'v4'

    @patch('sm.engine.annotation.job.ESExporter', spec=ESExporter)
    def test_delete_ds(self, EsMock, fill_db):
        db = DB()
        manager = create_daemon_man(db=db, es=EsMock())

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id)

        manager.delete(ds)

        EsMock.return_value.delete_ds.assert_has_calls([call(ds_id)])
        assert db.select_one('SELECT * FROM dataset WHERE id = %s', params=(ds_id,)) == []
