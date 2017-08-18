from mock import patch, MagicMock, call
import json
from datetime import datetime

from copy import deepcopy
from pytest import fixture

from sm.engine import DB, ESExporter, QueuePublisher
from sm.engine.dataset_manager import SMapiDatasetManager, SMDaemonDatasetManager, ConfigDiff
from sm.engine.dataset_manager import Dataset, DatasetActionPriority, DatasetAction, DatasetStatus
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS
from sm.engine.tests.util import spark_context, sm_config, ds_config, test_db


@fixture
def fill_db(test_db, sm_config, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    meta = {"meta": "data"}
    db = DB(sm_config['db'])
    db.insert('INSERT INTO dataset values (%s, %s, %s, %s, %s, %s, %s)',
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(meta), json.dumps(ds_config), DatasetStatus.FINISHED)])
    db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
              rows=[(0, 0, ds_id)])
    db.insert("INSERT INTO sum_formula (id, db_id, sf) VALUES (%s, %s, %s)",
              rows=[(1, 0, 'H20')])
    db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, ion_image_url, iso_image_urls) "
               "VALUES (%s, %s, %s, %s, %s, %s)"),
              rows=[(0, 0, 1, '+H', None, ['iso_image_1_id', 'iso_image_2_id'])])


def create_ds_man(sm_config, sm_api=False):
    db = DB(sm_config['db'])
    es_mock = MagicMock(spec=ESExporter)
    queue_mock = MagicMock(spec=QueuePublisher)
    if sm_api:
        return db, es_mock, queue_mock, SMapiDatasetManager(db, es_mock, 'queue', queue_mock)
    else:
        return db, es_mock, queue_mock, SMDaemonDatasetManager(db, es_mock, 'queue', queue_mock)


def create_ds(ds_config):
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    return ds_id, upload_dt, Dataset(ds_id, 'ds_name', 'input_path', upload_dt, {}, ds_config)


class TestConfigDiff:

    def test_compare_configs_returns_equal(self, ds_config):
        old_config = deepcopy(ds_config)
        new_config = deepcopy(ds_config)
        assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.EQUAL

    def test_compare_configs_returns_inst_params_diff(self, ds_config):
        old_config = deepcopy(ds_config)
        new_config = deepcopy(ds_config)
        new_config['isotope_generation']['isocalc_sigma'] = 0.03
        assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.INSTR_PARAMS_DIFF

    def test_compare_configs_returns_new_mol_db(self, ds_config):
        old_config = deepcopy(ds_config)
        new_config = deepcopy(ds_config)
        new_config['databases'] = [{'name': 'ChEBI'}]
        assert ConfigDiff.compare_configs(old_config, new_config) == ConfigDiff.NEW_MOL_DB


class TestSMapiDatasetManager:

    def test_add_new_ds(self, test_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=True)
        ds_id, upload_dt, ds = create_ds(ds_config)

        ds_man.add(ds, DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.ADD}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_delete_ds(self, test_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=True)
        ds_id, upload_dt, ds = create_ds(ds_config)

        ds_man.delete(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.DELETE}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_update_ds_configs_equal(self, fill_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=True)
        ds_id, upload_dt, ds = create_ds(ds_config)

        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.UPDATE}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_update_ds_new_mol_db(self, fill_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=True)
        ds_id, upload_dt, ds = create_ds(ds_config)

        ds.config['databases'] = [{'name': 'HMDB'}, {'name': 'ChEBI'}]
        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.ADD}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.DEFAULT)])

    def test_update_ds_instr_param_diff(self, fill_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=True)
        ds_id, upload_dt, ds = create_ds(ds_config)

        ds.config['isotope_generation']['isocalc_sigma'] *= 2
        ds_man.update(ds)

        queue_mock.publish.assert_has_calls([
            call({'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.DELETE},
                 SM_ANNOTATE, DatasetActionPriority.HIGH),
            call({'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.ADD},
                 SM_ANNOTATE, DatasetActionPriority.DEFAULT)
        ], any_order=True)


class TestSMDaemonDatasetManager:

    def test_update_ds(self, fill_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=False)
        ds_id, upload_dt, ds = create_ds(ds_config)

        with patch('sm.engine.dataset_manager.MolecularDB') as MolecularDB:
            mol_db_mock = MolecularDB.return_value
            mol_db_mock.name = 'HMDB'

            ds_man.update(ds)

            es_mock.index_ds.assert_called_with(ds_id, mol_db_mock, del_first=True)

    def test_delete_ds(self, fill_db, sm_config, ds_config):
        db, es_mock, queue_mock, ds_man = create_ds_man(sm_config, sm_api=False)
        ds_id, upload_dt, ds = create_ds(ds_config)

        with patch('sm.engine.dataset_manager.ImageStoreServiceWrapper') as ImageStoreServiceWrapper:
            img_store_service_mock = ImageStoreServiceWrapper.return_value

            ds_man.delete(ds)

            urls = ['{}/delete/{}'.format(sm_config['services']['iso_images'], 'iso_image_{}_id'.format(id))
                    for id in range(1, 3)]
            img_store_service_mock.delete_image.assert_has_calls([call(urls[0]), call(urls[1])])
            es_mock.delete_ds.assert_called_with(ds_id)
            assert db.select_one('SELECT * FROM dataset WHERE id = %s', ds_id) == []
