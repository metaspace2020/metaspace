from __future__ import unicode_literals
from mock import patch, MagicMock

from sm.engine.db import DB
from sm.engine.dataset_manager import DatasetManager, Dataset
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.tests.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


@patch('sm.engine.dataset_manager.QueuePublisher')
def test_dataset_manager_add_ds_new_ds_id(QueuePublisherMock, create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config
    qpub_mock = QueuePublisherMock()

    db = DB(sm_config['db'])
    try:
        ds = Dataset('new_ds_id', 'ds_name', 'input_path', {'meta': 'data'}, {'config': 0})
        ds_man = DatasetManager(db, None, mode='queue')
        ds_man.add_ds(ds)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('new_ds_id', 'ds_name', 'input_path', {'meta': 'data'}, {'config': 0})

        qpub_mock.publish.assert_called_once_with({
            'ds_id': 'new_ds_id',
            'ds_name': 'ds_name',
            'input_path': 'input_path'
        })
    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
@patch('sm.engine.dataset_manager.QueuePublisher')
def test_dataset_manager_add_ds_ds_id_exists(QueuePublisherMock, ImageStoreServiceWrapperMock,
                                             create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config
    qpub_mock = QueuePublisherMock()
    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    try:
        db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)",
                  rows=[('ds_id', 'ds_name', 'input_path', '{}', '{}')])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', 'ion_image_url', ['iso_image_url_0'])])

        ds = Dataset('ds_id', 'new_ds_name', 'input_path', {'meta': 'data'}, {'config': 0})
        ds_man = DatasetManager(db, es, mode='queue')
        ds_man.add_ds(ds)

        rows = db.select("SELECT * FROM dataset")
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'new_ds_name', 'input_path', {'meta': 'data'}, {'config': 0})

        qpub_mock.publish.assert_called_once_with({
            'ds_id': 'ds_id',
            'ds_name': 'new_ds_name',
            'input_path': 'input_path'
        })

        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
    finally:
        db.close()


@patch('sm.engine.dataset_manager.MolecularDB')
def test_dataset_manager_update_ds_reindex_only(MolecularDBMock, create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config
    moldb_mock = MolecularDBMock()

    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}',
                         '{"databases": [{"name": "HMDB", "version": "2017-01"}]}')])

        ds = Dataset.load_ds('ds_id', db)
        ds.meta = {'new': 'meta'}
        ds_man = DatasetManager(db, es, mode='queue')
        ds_man.update_ds(ds)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'ds_name', 'input_path', {'new': 'meta'},
                           {"databases": [{"name": "HMDB", "version": "2017-01"}]})

        es.index_ds.assert_called_once_with('ds_id', moldb_mock)
    finally:
        db.close()


@patch('sm.engine.dataset_manager.QueuePublisher')
def test_dataset_manager_update_ds_new_job_submitted(QueuePublisherMock, create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    qpub_mock = QueuePublisherMock()
    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path',
                         '{"metaspace_options": {"Metabolite_Database": "db"}}', '{"config": "value"}')])

        ds = Dataset.load_ds('ds_id', db)
        ds.config = {"config": "new_value"}
        ds_man = DatasetManager(db, es, mode='queue')
        ds_man.update_ds(ds)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'ds_name', 'input_path',
                           {"metaspace_options": {"Metabolite_Database": "db"}}, {"config": "new_value"})

        msg = {
            'ds_id': 'ds_id',
            'ds_name': 'ds_name',
            'input_path': 'input_path',
        }
        qpub_mock.publish.assert_called_once_with(msg)
    finally:
        db.close()


def test_dataset_load_ds_works(create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', '{"config": 0}')])

        ds = Dataset.load_ds('ds_id', db)

        assert ((ds.id, ds.name, ds.input_path, ds.meta, ds.config) ==
                ('ds_id', 'ds_name', 'input_path', {"meta": "data"}, {"config": 0}))
    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
@patch('sm.engine.dataset_manager.WorkDirManager')
def test_dataset_manager_delete_ds_works(WorkDirManagerMock, ImageStoreServiceWrapperMock,
                                         create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    wd_man = WorkDirManagerMock()
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', '{"config": 0}')])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', 'ion_image_url', ['iso_image_url_0'])])

        ds_man = DatasetManager(db, es, mode='queue')
        ds = Dataset.load_ds('ds_id', db)
        ds_man.delete_ds(ds, del_raw_data=True)

        assert 0 == len(db.select('SELECT * FROM dataset WHERE id = %s', ds.id))
        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
        wd_man.del_input_data.assert_called_once_with('input_path')
    finally:
        db.close()
