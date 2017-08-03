from __future__ import unicode_literals
from mock import patch, MagicMock
import json

from sm.engine.db import DB
from sm.engine.dataset_manager import DatasetManager, Dataset, ConfigDiff
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher, SM_ANNOTATE
from sm.engine.util import SMConfig
from copy import deepcopy
from sm.engine.tests.util import spark_context, sm_config, ds_config, test_db


def test_dataset_manager_add_ds_new_ds_id(test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config
    qpub_mock = MagicMock(spec=QueuePublisher)

    db = DB(sm_config['db'])
    es = MagicMock(spec=ESExporter)
    try:
        ds = Dataset('new_ds_id', 'ds_name', 'input_path',
                     {'metaspace_options': {'notify_submitter': False}}, ds_config)
        ds_man = DatasetManager(db, es, mode='queue', queue_publisher=qpub_mock)
        ds_man.add_ds(ds, priority=1)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('new_ds_id', 'ds_name', 'input_path',
                           {'metaspace_options': {'notify_submitter': False}}, ds_config, 'QUEUED')

        qpub_mock.publish.assert_any_call({
            'ds_id': 'new_ds_id',
            'ds_name': 'ds_name',
            'input_path': 'input_path'
        }, SM_ANNOTATE, 1)
    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
def test_dataset_manager_add_ds_ds_id_exists(ImageStoreServiceWrapperMock,
                                             test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config
    qpub_mock = MagicMock(spec=QueuePublisher)
    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(spec=ESExporter)
    try:
        db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)",
                  rows=[('ds_id', 'ds_name', 'input_path', '{}', '{}')])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert("INSERT INTO sum_formula (id, db_id, sf) VALUES (%s, %s, %s)",
                  rows=[(1, 0, 'H20')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', None, ['iso_image_1_url', 'iso_image_2_url'])])

        ds = Dataset('ds_id', 'new_ds_name', 'input_path',
                     {'metaspace_options': {'notify_submitter': False}}, ds_config)
        ds_man = DatasetManager(db, es, mode='queue', queue_publisher=qpub_mock)
        ds_man.add_ds(ds, priority=1)

        rows = db.select("SELECT * FROM dataset")
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'new_ds_name', 'input_path',
                           {'metaspace_options': {'notify_submitter': False}}, ds_config, 'QUEUED')

        qpub_mock.publish.assert_any_call({
            'ds_id': 'ds_id',
            'ds_name': 'new_ds_name',
            'input_path': 'input_path'
        }, SM_ANNOTATE, 1)

        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
    finally:
        db.close()


@patch('sm.engine.dataset_manager.MolecularDB')
def test_dataset_manager_update_ds_reindex_only(MolecularDBMock, test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config
    moldb_mock = MolecularDBMock()

    db = DB(sm_config['db'])
    es = MagicMock(spec=ESExporter)
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', json.dumps(ds_config))])

        ds = Dataset.load_ds('ds_id', db)
        ds.meta = {'new': 'meta'}
        ds_man = DatasetManager(db, es, mode='local')
        ds_man.update_ds(ds)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'ds_name', 'input_path', {'new': 'meta'}, ds_config,
                           'FINISHED')

        es.index_ds.assert_called_once_with('ds_id', moldb_mock, del_first=True)
    finally:
        db.close()


def test_dataset_manager_update_ds_new_job_submitted(test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config

    qpub_mock = MagicMock(spec=QueuePublisher)
    db = DB(sm_config['db'])
    es = MagicMock(spec=ESExporter)
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path',
                         '{"metaspace_options": {"Metabolite_Database": "db"}}', json.dumps(ds_config))])

        ds = Dataset.load_ds('ds_id', db)
        new_ds_config = deepcopy(ds_config)
        new_ds_config['databases'].append({'name': 'ChEBI', 'version': '2008'})
        ds.config = new_ds_config
        ds_man = DatasetManager(db, es, mode='queue', queue_publisher=qpub_mock)
        ds_man.update_ds(ds, priority=2)

        rows = db.select('SELECT * FROM dataset')
        assert len(rows) == 1
        assert rows[0] == ('ds_id', 'ds_name', 'input_path',
                           {"metaspace_options": {"Metabolite_Database": "db"}}, new_ds_config, 'QUEUED')

        msg = {
            'ds_id': 'ds_id',
            'ds_name': 'ds_name',
            'input_path': 'input_path',
        }
        qpub_mock.publish.assert_any_call(msg, SM_ANNOTATE, 2)
    finally:
        db.close()


def test_dataset_load_ds_works(test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', json.dumps(ds_config))])

        ds = Dataset.load_ds('ds_id', db)

        assert ((ds.id, ds.name, ds.input_path, ds.meta, ds.config) ==
                ('ds_id', 'ds_name', 'input_path', {"meta": "data"}, ds_config))
    finally:
        db.close()


@patch('sm.engine.dataset_manager.ImageStoreServiceWrapper')
@patch('sm.engine.dataset_manager.WorkDirManager')
def test_dataset_manager_delete_ds_works(WorkDirManagerMock, ImageStoreServiceWrapperMock,
                                         test_db, sm_config, ds_config):
    SMConfig._config_dict = sm_config

    img_store = ImageStoreServiceWrapperMock()
    db = DB(sm_config['db'])
    es = MagicMock(spec=ESExporter)
    wd_man = WorkDirManagerMock()
    try:
        db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s)',
                  rows=[('ds_id', 'ds_name', 'input_path', '{"meta": "data"}', json.dumps(ds_config))])
        db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
                  rows=[(0, 0, 'ds_id')])
        db.insert("INSERT INTO sum_formula (id, db_id, sf) VALUES (%s, %s, %s)",
                  rows=[(1, 0, 'H20')])
        db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
                   "VALUES (%s, %s, %s, %s, %s, %s)"),
                  rows=[(0, 0, 1, '+H', None, ['iso_image_1_url', 'iso_image_2_url'])])

        ds_man = DatasetManager(db, es, mode='local')
        ds = Dataset.load_ds('ds_id', db)
        ds_man.delete_ds(ds, del_raw_data=True)

        assert 0 == len(db.select('SELECT * FROM dataset WHERE id = %s', ds.id))
        es.delete_ds.assert_called_once_with('ds_id')
        assert 2 == img_store.delete_image.call_count
        wd_man.del_input_data.assert_called_once_with('input_path')
    finally:
        db.close()


def test_compare_configs_returns_equal(ds_config):
    old_config = deepcopy(ds_config)
    new_config = deepcopy(ds_config)
    assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.EQUAL


def test_compare_configs_returns_inst_params_diff(ds_config):
    old_config = deepcopy(ds_config)
    new_config = deepcopy(ds_config)
    new_config['isotope_generation']['isocalc_sigma'] = 0.03
    assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.INSTR_PARAMS_DIFF


def test_compare_configs_returns_new_mol_db(ds_config):
    old_config = deepcopy(ds_config)
    new_config = deepcopy(ds_config)
    new_config['databases'] = [{'name': 'ChEBI'}]
    assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.NEW_MOL_DB
