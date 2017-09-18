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
from sm.engine.tests.util import spark_context, sm_config, ds_config, test_db
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
              rows=[(1, 0, 'H20')])
    db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf_id, adduct, iso_image_ids) "
               "VALUES (%s, %s, %s, %s, %s)"),
              rows=[(0, 0, 1, '+H', ['iso_image_1_id', 'iso_image_2_id'])])
    db.close()


def create_ds_man(sm_config, db=None, es=None, queue=None, sm_api=False):
    db = db or DB(sm_config['db'])
    es_mock = es or MagicMock(spec=ESExporter)
    queue_mock = queue or MagicMock(spec=QueuePublisher)
    if sm_api:
        return SMapiDatasetManager(SM_ANNOTATE, db, es_mock, 'queue', queue_mock)
    else:
        return SMDaemonDatasetManager(db, es_mock, 'queue', queue_mock)


def create_ds(ds_id='2000-01-01', ds_name='ds_name', input_path='input_path', upload_dt=None,
              metadata=None, ds_config=None, status=DatasetStatus.NEW):
    upload_dt = upload_dt or datetime.now()
    return Dataset(ds_id, ds_name, input_path, upload_dt, metadata or {}, ds_config or {}, status=status)


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
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.add(ds, priority=DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD, 'del_first': False}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_add_ds__already_exists(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        db = DB(sm_config['db'])
        try:
            ds_man = create_ds_man(sm_config, db=db, es=es_mock, queue=queue_mock, sm_api=True)

            ds_id = '2000-01-01'
            ds = create_ds(ds_id=ds_id, ds_config=ds_config)

            with pytest.raises(DSIDExists):
                ds_man.add(ds)
        finally:
            db.close()

    def test_delete_ds(self, test_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.delete(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path', 'action': DatasetAction.DELETE}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_update_ds__configs_equal_metadata_diff(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)
        ds.meta = {'new': 'metadata'}

        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.UPDATE}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.HIGH)])

    def test_update_ds__configs_metadata_equal__do_nothing(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.update(ds)

        queue_mock.assert_not_called()

    def test_update_ds_new_mol_db(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds.config['databases'] = [{'name': 'HMDB'}, {'name': 'ChEBI'}]
        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.DEFAULT)])

    def test_update_ds__instr_param_diff(self, fill_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_ds_man(sm_config, queue=queue_mock, sm_api=True)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds.config['isotope_generation']['isocalc_sigma'] *= 2
        ds_man.update(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path',
               'action': DatasetAction.ADD, 'del_first': True}
        queue_mock.publish.assert_has_calls([call(msg, SM_ANNOTATE, DatasetActionPriority.DEFAULT)])


class TestSMDaemonDatasetManager:

    class SearchJob():
        def run(self, *args):
            pass

    def test_add_ds(self, test_db, sm_config, ds_config):
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        db = DB(sm_config['db'])
        try:
            ds_man = create_ds_man(sm_config, db=db, es=es_mock, queue=queue_mock, sm_api=False)

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
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        ds_man = create_ds_man(sm_config, es=es_mock, queue=queue_mock, sm_api=False)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        with patch('sm.engine.dataset_manager.MolecularDB') as MolecularDB:
            mol_db_mock = MolecularDB.return_value
            mol_db_mock.name = 'HMDB'

            ds_man.update(ds)

            es_mock.delete_ds.assert_called_with(ds_id)
            es_mock.index_ds.assert_called_with(ds_id, mol_db_mock)

    def test_delete_ds(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        ds_man = create_ds_man(sm_config, db=db, es=es_mock, queue=queue_mock, sm_api=False)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        with patch('sm.engine.dataset_manager.ImageStoreServiceWrapper') as ImageStoreServiceWrapper:
            img_store_service_mock = ImageStoreServiceWrapper.return_value

            ds_man.delete(ds)

            ids = ['iso_image_{}_id'.format(id) for id in range(1, 3)]
            img_store_service_mock.delete_image_by_id.assert_has_calls([call(ids[0]), call(ids[1])])
            es_mock.delete_ds.assert_called_with(ds_id)
            assert db.select_one('SELECT * FROM dataset WHERE id = %s', ds_id) == []

    def test_add_optical_image(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        ds_man = create_ds_man(sm_config, db=db, es=es_mock, queue=queue_mock, sm_api=True)

        ds_man._annotation_image_shape = MagicMock(return_value=(100, 100))

        iso_img_store_mock = MagicMock(ImageStoreServiceWrapper)
        opt_img_store_mock = MagicMock(ImageStoreServiceWrapper)
        opt_img_store_mock.post_image.side_effect = ['opt_img_id1', 'opt_img_id2', 'opt_img_id3']
        ds_man._iso_img_store = MagicMock(return_value=iso_img_store_mock)
        ds_man._optical_img_store = MagicMock(return_value=opt_img_store_mock)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        optical_image = Image.new('RGB', (100, 100))
        zoom_levels = [1, 2, 3]
        ds_man.add_optical_image(ds, optical_image, [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                                 zoom_levels=zoom_levels)
        assert db.select('SELECT * FROM optical_image') == [
                ('opt_img_id{}'.format(i + 1), ds.id, zoom)
                for i, zoom in enumerate(zoom_levels)]
