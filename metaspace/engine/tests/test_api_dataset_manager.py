from unittest.mock import MagicMock, call
from datetime import datetime

from sm.engine.daemons.actions import DaemonAction
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher
from sm.rest.dataset_manager import SMapiDatasetManager
from sm.rest.dataset_manager import DatasetActionPriority, DatasetStatus
from tests.utils import create_test_ds


def create_api_ds_man(
    es=None, annot_queue=None, update_queue=None, lit_queue=None, status_queue=None
):
    es_mock = es or MagicMock(spec=ESExporter)
    annot_queue_mock = annot_queue or MagicMock(QueuePublisher)
    update_queue_mock = update_queue or MagicMock(QueuePublisher)
    lit_queue_mock = lit_queue or MagicMock(QueuePublisher)
    status_queue_mock = status_queue or MagicMock(QueuePublisher)

    return SMapiDatasetManager(
        db=DB(),
        es=es_mock,
        annot_queue=annot_queue_mock,
        update_queue=update_queue_mock,
        lit_queue=lit_queue_mock,
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
        is_public=True,
    )


class TestSMapiDatasetManager:
    def test_add_new_ds(self, fill_db, ds_config):
        action_queue_mock = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(annot_queue=action_queue_mock)

        ds_id = '2000-01-01'
        ds_doc = create_ds_doc(ds_id=ds_id)

        ds_man.add(ds_doc, use_lithops=False, priority=DatasetActionPriority.HIGH)

        msg = {'ds_id': ds_id, 'ds_name': 'ds_name', 'action': DaemonAction.ANNOTATE}
        action_queue_mock.publish.assert_has_calls([call(msg, DatasetActionPriority.HIGH)])

    def test_delete_ds(self, fill_db, metadata, ds_config):
        update_queue = MagicMock(spec=QueuePublisher)
        ds_man = create_api_ds_man(update_queue=update_queue)
        ds = create_test_ds()

        ds_man.delete(ds.id)

        msg = {'ds_id': ds.id, 'ds_name': 'ds_name', 'action': DaemonAction.DELETE}
        update_queue.publish.assert_has_calls([call(msg, DatasetActionPriority.STANDARD)])
