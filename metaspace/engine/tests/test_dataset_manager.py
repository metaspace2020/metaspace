import json
import pytest
from mock import patch, MagicMock

from sm.engine.db import DB
from sm.engine.dataset_manager import DatasetManager, Dataset
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.tests.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


def test_dataset_manager_add_ds_new_ds_id(create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    qpub = MagicMock(QueuePublisher)
    try:
        ds = Dataset('new_ds_id', 'ds_name', 'input_path', {'meta': 'data'}, {'config': 0})
        ds_man = DatasetManager(db, None, qpub, None)
        ds_man.add_ds(ds)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('new_ds_id', 'ds_name', 'input_path', {'meta': 'data'}, {'config': 0})

        qpub.publish.assert_called_once_with({
            'ds_id': 'new_ds_id',
            'ds_name': 'ds_name',
            'input_path': 'input_path'
        })
    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
def test_dataset_manager_add_ds_ds_id_exists(ImageStoreServiceWrapperMock, create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    qpub = MagicMock(QueuePublisher)
    try:
        db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)",
                  rows=[('ds_id', 'ds_name', 'input_path', '{}', '{}')])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', 'ion_image_url', ['iso_image_url_0'])])

        ds = Dataset('ds_id', 'new_ds_name', 'input_path', {'meta': 'data'}, {'config': 0})
        ds_man = DatasetManager(db, es, qpub, None)
        ds_man.add_ds(ds)

        rows = db.select("SELECT * FROM dataset")
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'new_ds_name', 'input_path', {'meta': 'data'}, {'config': 0})

        qpub.publish.assert_called_once_with({
            'ds_id': 'ds_id',
            'ds_name': 'new_ds_name',
            'input_path': 'input_path'
        })

        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
    finally:
        db.close()


def test_dataset_load_ds_works(create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', '{"config": 0}')])

        ds = Dataset.load_ds('ds_id', db)

        assert (ds.id, ds.name, ds.input_path, ds.meta, ds.config ==
                ('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', '{"config": 0}'))

    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
def test_dataset_manager_delete_ds_works(ImageStoreServiceWrapperMock, create_test_db, drop_test_db, sm_config):
    SMConfig._config_dict = sm_config

    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(ESExporter())
    qpub = MagicMock(QueuePublisher)
    wd_man = MagicMock(WorkDirManager)
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', '{"config": 0}')])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', 'ion_image_url', ['iso_image_url_0'])])

        ds_man = DatasetManager(db, es, qpub, wd_man)
        ds = Dataset.load_ds('ds_id', db)
        ds_man.delete_ds(ds, del_raw_data=True)

        assert 0 == len(db.select('SELECT * FROM dataset WHERE id = %s', ds.id))
        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
        wd_man.del_input_data.assert_called_once_with('input_path')
    finally:
        db.close()
