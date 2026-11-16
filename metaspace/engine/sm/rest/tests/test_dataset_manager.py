"""Unit tests for SMapiDatasetManager.update (mocked DB, ES and queue)."""
from unittest.mock import MagicMock, patch

from sm.engine.daemons.actions import DaemonAction
from sm.rest.dataset_manager import SMapiDatasetManager


def test_update_posts_metadata_v2_in_fields():
    ds = MagicMock(id='ds1', name='n', size_hash=None)
    update_queue = MagicMock()
    with patch('sm.rest.dataset_manager.SMConfig.get_conf', return_value={}), patch(
        'sm.rest.dataset_manager.Dataset.load', return_value=ds
    ):
        manager = SMapiDatasetManager(db=MagicMock(), es=MagicMock(), update_queue=update_queue)
        manager.update(
            'ds1',
            {'name': 'n2', 'metadata_v2': {'document': {}, 'unmodeled': {}}},
            async_es_update=False,
        )
    msg = update_queue.publish.call_args[0][0]
    assert msg['action'] == DaemonAction.UPDATE
    assert sorted(msg['fields']) == ['metadata_v2', 'name']
    assert ds.metadata_v2 == {'document': {}, 'unmodeled': {}}
