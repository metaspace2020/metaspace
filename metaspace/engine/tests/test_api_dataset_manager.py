from unittest.mock import patch, MagicMock, call
import json
from datetime import datetime
import pytest
from PIL import Image

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.rest.dataset_manager import SMapiDatasetManager
from sm.rest.dataset_manager import Dataset, DatasetActionPriority, DatasetStatus
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.tests.util import pysparkling_context, sm_config, ds_config, test_db, fill_db


def create_api_ds_man(sm_config, db=None, es=None, img_store=None,
                      annot_queue=None, update_queue=None, status_queue=None):
    db = db or DB(sm_config['db'])
    es_mock = es or MagicMock(spec=ESExporter)
    annot_queue_mock = annot_queue or MagicMock(QueuePublisher)
    update_queue_mock = update_queue or MagicMock(QueuePublisher)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)
    img_store_mock = img_store or MagicMock(spec=ImageStoreServiceWrapper)

    return SMapiDatasetManager(db=db, es=es_mock,
                               image_store=img_store_mock,
                               annot_queue=annot_queue_mock,
                               update_queue=update_queue_mock,
                               status_queue=status_queue_mock)


def create_ds(ds_id='2000-01-01', ds_name='ds_name', input_path='input_path', upload_dt=None,
              metadata=None, ds_config=None, status=DatasetStatus.NEW, mol_dbs=None, adducts=None):
    upload_dt = upload_dt or datetime.now()
    if not mol_dbs:
        mol_dbs = ['HMDB-v4']
    if not adducts:
        adducts = ['+H', '+Na', '+K']
    return Dataset(ds_id, ds_name, input_path, upload_dt, metadata or {}, ds_config or {},
                   status=status, mol_dbs=mol_dbs, adducts=adducts, img_storage_type='fs')


class TestSMapiDatasetManager:

    def test_add_new_ds(self, test_db, sm_config, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(sm_config, annot_queue=action_queue_mock)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.add(ds, priority=DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'action': 'annotate'}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_delete_ds(self, test_db, sm_config, ds_config):
        update_queue = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(sm_config, update_queue=update_queue)

        ds_id = '2000-01-01'
        ds = create_ds(ds_id=ds_id, ds_config=ds_config)

        ds_man.delete(ds)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'action': 'delete'}
        update_queue.publish.assert_has_calls([call(msg, DatasetActionPriority.STANDARD)])

    def test_add_optical_image(self, fill_db, sm_config, ds_config):
        db = DB(sm_config['db'])
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        img_store_mock = MagicMock(ImageStoreServiceWrapper)
        img_store_mock.post_image.side_effect = ['opt_img_id1', 'opt_img_id2', 'opt_img_id3', 'thumbnail_id']
        img_store_mock.get_image_by_id.return_value = Image.new('RGB', (100, 100))

        ds_man = create_api_ds_man(sm_config=sm_config, db=db, es=es_mock,
                                   img_store=img_store_mock, annot_queue=action_queue_mock)
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
        assert db.select('SELECT optical_image FROM dataset where id = %s', params=(ds_id,)) == [(raw_img_id,)]
        assert db.select('SELECT thumbnail FROM dataset where id = %s', params=(ds_id,)) == [('thumbnail_id',)]
