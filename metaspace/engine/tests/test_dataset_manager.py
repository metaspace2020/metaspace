from unittest.mock import patch, MagicMock, call
import json
from datetime import datetime
from copy import deepcopy
import pytest
from PIL import Image

from sm.engine import DB, ESExporter, QueuePublisher
from sm.engine.dataset_manager import SMapiDatasetManager, SMDaemonDatasetManager, ConfigDiff
from sm.engine.dataset_manager import Dataset, DatasetActionPriority, DatasetAction, DatasetStatus
from sm.engine.errors import DSIDExists
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS
from sm.engine.tests.util import pysparkling_context, sm_config, ds_config, test_db
from sm.engine.png_generator import ImageStoreServiceWrapper


@pytest.fixture()
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
              rows=[(1, 0, 'H2O')])
    db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf, adduct, iso_image_ids) "
               "VALUES (%s, %s, %s, %s, %s)"),
              rows=[(0, 0, 'H2O', '+H', ['iso_image_1_id', 'iso_image_2_id'])])
    db.close()


def create_ds_man(sm_config, db=None, es=None, img_store=None,
                  action_queue=None, status_queue=None, sm_api=False):
    db = db or DB(sm_config['db'])
    es_mock = es or MagicMock(spec=ESExporter)
    action_queue_mock = action_queue or MagicMock(QueuePublisher)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)
    img_store_mock = img_store or MagicMock(spec=ImageStoreServiceWrapper)
    if sm_api:
        return SMapiDatasetManager(db=db, es=es_mock,
                                   mode='queue', image_store=img_store_mock,
                                   action_queue=action_queue_mock, status_queue=status_queue_mock)
    else:
        return SMDaemonDatasetManager(db=db, es=es_mock,
                                      img_store=img_store_mock, mode=None,
                                      status_queue=status_queue_mock)


def create_ds(ds_id='2000-01-01', ds_name='ds_name', input_path='input_path', upload_dt=None,
              metadata=None, ds_config=None, status=DatasetStatus.NEW):
    upload_dt = upload_dt or datetime.now()
    ds = Dataset(ds_id, ds_name, input_path, upload_dt, metadata or {}, ds_config or {}, status=status)
    ds.ion_img_storage_type = 'fs'
    return ds


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
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.add(ds, priority=DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD, 'del_first': False}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_add_ds__already_exists(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        db = DB(sm_config['db'])
        try:
            ds_man = create_ds_man(sm_config, db=db, es=es_mock, action_queue=queue_mock, sm_api=True)

            ds_id = '2000-01-01'
            ds = create_ds(ds_id=ds_id, ds_config=ds_config)

            with pytest.raises(DSIDExists):
                ds_man.add(ds)
        finally:
            db.close()

    def test_delete_ds(self, test_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.delete(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.DELETE}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_update_ds__configs_equal_metadata_diff(self, fill_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)
        ds.meta = {'new': 'metadata'}

        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.UPDATE}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_update_ds__configs_metadata_equal__do_nothing(self, fill_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.update(ds)

        action_queue_mock.assert_not_called()

    def test_update_ds_new_mol_db(self, fill_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds.config['databases'] = [{'name': 'HMDB'}, {'name': 'ChEBI'}]
        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.DEFAULT)])

    def test_update_ds__instr_param_diff(self, fill_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, action_queue=action_queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds.config['isotope_generation']['isocalc_sigma'] *= 2
        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD, 'del_first': True}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.DEFAULT)])

    def test_add_optical_image(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        img_store_mock = MagicMock(ImageStoreServiceWrapper)
        img_store_mock.post_image.side_effect = ['opt_img_id1', 'opt_img_id2', 'opt_img_id3']
        img_store_mock.get_image_by_id.return_value = Image.new('RGB', (100, 100))

        ds_man = create_ds_man(sm_config=sm_config, db=db, es=es_mock,
                               img_store=img_store_mock, action_queue=action_queue_mock, sm_api=True)
        ds_man._annotation_image_shape = MagicMock(return_value=(100, 100))

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        zoom_levels = [1, 2, 3]
        raw_img_id = 'raw_opt_img_id'
        ds_man.add_optical_image(ds, raw_img_id, [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                                 zoom_levels=zoom_levels)
        assert db.select('SELECT * FROM optical_image') == [
                ('opt_img_id{}'.format(i + 1), ds.id, zoom)
                for i, zoom in enumerate(zoom_levels)]
        assert db.select('SELECT optical_image FROM dataset where id = %s', ds_id) == [(raw_img_id,)]


class TestSMDaemonDatasetManager:

    class SearchJob:
        def __init__(self, *args, **kwargs):
            pass

        def run(self, *args, **kwargs):
            pass

    def test_add_ds(self, test_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        db = DB(sm_config['db'])
        try:
            ds_man = create_ds_man(sm_config, db=db, es=es_mock, action_queue=action_queue_mock, sm_api=False)

            ds_id = '2000-01-01'
            ds_name = 'ds_name'
            input_path = 'input_path'
            upload_dt = datetime.now()
            metadata = {}
            ds = create_ds(ds_id=ds_id, ds_name=ds_name, input_path=input_path, upload_dt=upload_dt,
                           metadata=metadata, ds_config=ds_config)

            ds_man.add(ds, search_job_factory=self.SearchJob)

            DS_SEL = 'select name, input_path, upload_dt, metadata, config from dataset where id=%s'
            assert (db.select_one(DS_SEL, ds_id) == (ds_name, input_path, upload_dt, metadata, ds_config))
        finally:
            db.close()

    def test_update_ds(self, fill_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        ds_man = create_ds_man(sm_config, es=es_mock, action_queue=action_queue_mock, sm_api=False)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        with patch('sm.engine.dataset_manager.MolecularDB') as MolecularDB:
            mol_db_mock = MolecularDB.return_value
            mol_db_mock.name = 'HMDB'

            with patch('sm.engine.dataset_manager.MolDBServiceWrapper') as MolDBServiceWrapper:
                moldb_service_wrapper_mock = MolDBServiceWrapper.return_value
                moldb_service_wrapper_mock.find_db_by_id.return_value = {'name': 'HMDB-v2.5'}

                ds_man.update(ds)

                es_mock.delete_ds.assert_called_with(ds_id)
                call_args = es_mock.index_ds.call_args[1].values()
                assert ds_id in call_args and mol_db_mock in call_args

    def test_delete_ds(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        img_store_service_mock = MagicMock(spec=ImageStoreServiceWrapper)
        ds_man = create_ds_man(sm_config, db=db, es=es_mock, img_store=img_store_service_mock,
                               action_queue=action_queue_mock, sm_api=False)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.delete(ds)

        ids = ['iso_image_{}_id'.format(id) for id in range(1, 3)]
        img_store_service_mock.delete_image_by_id.assert_has_calls(
            [call('fs', 'iso_image', ids[0]), call('fs', 'iso_image', ids[1])])
        es_mock.delete_ds.assert_called_with(ds_id)
        assert db.select_one('SELECT * FROM dataset WHERE id = %s', ds_id) == []
