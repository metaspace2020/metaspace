from unittest.mock import call
from unittest.mock import patch, MagicMock
from datetime import datetime

from sm.engine.sm_daemons import SMDaemonManager
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.tests.util import pysparkling_context, sm_config, ds_config, test_db, fill_db
from sm.engine.tests.util import sm_index, es_dsl_search


def create_ds(ds_id='2000-01-01', ds_name='ds_name', input_path='input_path', upload_dt=None,
              metadata=None, ds_config=None, status=DatasetStatus.NEW, mol_dbs=None, adducts=None):
    upload_dt = upload_dt or datetime.now()
    if not mol_dbs:
        mol_dbs = ['HMDB-v4']
    if not adducts:
        adducts = ['+H', '+Na', '+K']
    return Dataset(ds_id, ds_name, input_path, upload_dt, metadata or {}, ds_config or {},
                   status=status, mol_dbs=mol_dbs, adducts=adducts, img_storage_type='fs')


def create_daemon_man(sm_config, db=None, es=None, img_store=None, status_queue=None):
    db = db or DB(sm_config['db'])
    es_mock = es or MagicMock(spec=ESExporter)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)
    img_store_mock = img_store or MagicMock(spec=ImageStoreServiceWrapper)

    return SMDaemonManager(db=db, es=es_mock,
                           img_store=img_store_mock,
                           status_queue=status_queue_mock)


class TestSMDaemonDatasetManager:

    class SearchJob:
        def __init__(self, *args, **kwargs):
            pass

        def run(self, *args, **kwargs):
            pass

    def test_annotate_ds(self, test_db, sm_config, ds_config):
        es_mock = MagicMock(spec=ESExporter)
        db = DB(sm_config['db'])
        try:
            manager = create_daemon_man(sm_config, db=db, es=es_mock)

            ds_id = '2000-01-01'
            ds_name = 'ds_name'
            input_path = 'input_path'
            upload_dt = datetime.now()
            metadata = {}
            ds = create_ds(ds_id=ds_id, ds_name=ds_name, input_path=input_path, upload_dt=upload_dt,
                           metadata=metadata, ds_config=ds_config)

            manager.annotate(ds, search_job_factory=self.SearchJob)

            DS_SEL = 'select name, input_path, upload_dt, metadata, config from dataset where id=%s'
            assert db.select_one(DS_SEL, params=(ds_id,)) == (ds_name, input_path, upload_dt, metadata, ds_config)
        finally:
            db.close()

    def test_index_ds(self, fill_db, sm_config, ds_config):
        es_mock = MagicMock(spec=ESExporter)
        manager = create_daemon_man(sm_config, es=es_mock)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        with patch('sm.engine.sm_daemons.MolecularDB') as MolecularDB:
            mol_db_mock = MolecularDB.return_value
            mol_db_mock.name = 'HMDB-v4'

            # with patch('sm.engine.mol_db.MolDBServiceWrapper') as MolDBServiceWrapper:
            #     moldb_service_wrapper_mock = MolDBServiceWrapper.return_value
            #     moldb_service_wrapper_mock.find_db_by_id.return_value = {'name': 'HMDB-v4'}

            manager.index(ds)

            es_mock.delete_ds.assert_called_with(ds_id)
            call_args = es_mock.index_ds.call_args[1].values()
            assert ds_id in call_args and mol_db_mock in call_args

    def test_delete_ds(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        es_mock = MagicMock(spec=ESExporter)
        img_store_service_mock = MagicMock(spec=ImageStoreServiceWrapper)
        manager = create_daemon_man(sm_config, db=db, es=es_mock, img_store=img_store_service_mock)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        manager.delete(ds)

        ids = ['iso_image_{}_id'.format(id) for id in range(1, 3)]
        img_store_service_mock.delete_image_by_id.assert_has_calls(
            [call('fs', 'iso_image', ids[0]), call('fs', 'iso_image', ids[1])])
        es_mock.delete_ds.assert_called_with(ds_id)
        assert db.select_one('SELECT * FROM dataset WHERE id = %s', params=(ds_id,)) == []
