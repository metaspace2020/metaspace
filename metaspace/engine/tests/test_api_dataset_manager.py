from itertools import product
from unittest.mock import MagicMock, call
from datetime import datetime
from PIL import Image

from sm.engine.daemon_action import DaemonAction
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.rest.dataset_manager import SMapiDatasetManager
from sm.rest.dataset_manager import Dataset, DatasetActionPriority, DatasetStatus
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.optical_image import OpticalImageType


def create_api_ds_man(
    es=None, img_store=None, annot_queue=None, update_queue=None, status_queue=None
):
    es_mock = es or MagicMock(spec=ESExporter)
    annot_queue_mock = annot_queue or MagicMock(QueuePublisher)
    update_queue_mock = update_queue or MagicMock(QueuePublisher)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)
    img_store_mock = img_store or MagicMock(spec=ImageStoreServiceWrapper)

    return SMapiDatasetManager(
        db=DB(),
        es=es_mock,
        image_store=img_store_mock,
        annot_queue=annot_queue_mock,
        update_queue=update_queue_mock,
        status_queue=status_queue_mock,
    )


def create_ds_doc(
    ds_id='2000-01-01',
    ds_name='ds_name',
    input_path='input_path',
    upload_dt=None,
    metadata=None,
    status=DatasetStatus.QUEUED,
    moldb_ids=None,
    adducts=None,
):
    upload_dt = upload_dt or datetime.now()
    if not moldb_ids:
        moldb_ids = [0]
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
    return dict(
        id=ds_id,
        name=ds_name,
        input_path=input_path,
        upload_dt=upload_dt,
        metadata=metadata,
        status=status,
        moldb_ids=moldb_ids,
        adducts=adducts,
        ion_img_storage_type='fs',
        is_public=True,
    )


class TestSMapiDatasetManager:
    def test_add_new_ds(self, fill_db, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(annot_queue=action_queue_mock)

        ds_id = '2000-01-01'
        ds_doc = create_ds_doc(ds_id=ds_id)

        ds_man.add(ds_doc, priority=DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'action': DaemonAction.ANNOTATE}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_delete_ds(self, fill_db, metadata, ds_config):
        update_queue = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(update_queue=update_queue)
        ds_id = '2000-01-01'
        ds = Dataset(
            id=ds_id,
            name='ds_name',
            input_path='input_path',
            upload_dt=datetime.now(),
            metadata=metadata,
            config=ds_config,
            status=DatasetStatus.FINISHED,
        )
        ds.save(DB())

        ds_man.delete(ds_id)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'action': DaemonAction.DELETE}
        update_queue.publish.assert_has_calls([call(msg, DatasetActionPriority.STANDARD)])

    def test_add_optical_image(self, fill_db, metadata, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        es_mock = MagicMock(spec=ESExporter)
        img_store_mock = MagicMock(ImageStoreServiceWrapper)
        img_store_mock.post_image.side_effect = [
            'opt_img_scaled_id1',
            'opt_img_id1',
            'opt_img_scaled_id2',
            'opt_img_id2',
            'opt_img_scaled_id3',
            'opt_img_id3',
            'thumbnail_id',
        ]
        img_store_mock.get_image_by_id.return_value = Image.new('RGB', (100, 100))

        db = DB()
        ds_man = create_api_ds_man(
            es=es_mock, img_store=img_store_mock, annot_queue=action_queue_mock
        )
        ds_man._annotation_image_shape = MagicMock(return_value=(100, 100))

        ds_id = '2000-01-01'
        ds = Dataset(
            id=ds_id,
            name='ds_name',
            input_path='input_path',
            upload_dt=datetime.now(),
            metadata=metadata,
            config=ds_config,
            status=DatasetStatus.QUEUED,
        )
        ds.save(db)

        zoom_levels = [1, 2, 3]
        raw_img_id = 'raw_opt_img_id'
        ds_man.add_optical_image(
            ds_id, raw_img_id, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], zoom_levels=zoom_levels
        )
        optical_images = db.select(f"SELECT ds_id, type, zoom FROM optical_image")
        for type, zoom in product(
            [OpticalImageType.SCALED, OpticalImageType.CLIPPED_TO_ION_IMAGE], zoom_levels
        ):
            assert (ds_id, type, zoom) in optical_images

        assert db.select('SELECT optical_image FROM dataset where id = %s', params=(ds_id,)) == [
            (raw_img_id,)
        ]
        assert db.select('SELECT thumbnail FROM dataset where id = %s', params=(ds_id,)) == [
            ('thumbnail_id',)
        ]
