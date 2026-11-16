"""Input assembly of submit_dataset / update_dataset with the optional metadata_v2 argument.

The GraphQL client is mocked; nothing here touches the network.
"""
import json
from unittest.mock import MagicMock

import pytest

from metaspace.sm_annotation_utils import SMInstance

METADATA = {'MS_Analysis': {'Polarity': 'Positive'}}
METADATA_V2 = {'schema_version': 2, 'MS_Analysis': {'Polarity': 'Positive'}}


@pytest.fixture()
def sm_mock():
    """SMInstance with a mocked GraphQL client (bypasses __init__ and its login)."""
    inst = SMInstance.__new__(SMInstance)
    gq = MagicMock()
    gq.get_primary_group_id.return_value = 'group-1'
    gq.map_scoring_model_to_id.return_value = None
    gq.query.return_value = {'currentUser': {'id': 'user-1'}}
    gq.create_dataset.return_value = json.dumps({'datasetId': 'ds-1'})
    inst._gqclient = gq
    inst._config = {}
    return inst


def _submit(inst, **kwargs):
    inst.submit_dataset(None, None, 'name', METADATA, True, [], input_path='s3://x', **kwargs)
    return inst._gqclient.create_dataset.call_args[0][0]


def test_submit_without_metadata_v2_omits_key(sm_mock):
    input_field = _submit(sm_mock)
    assert json.loads(input_field['metadataJson']) == METADATA
    assert 'metadataV2Json' not in input_field


def test_submit_dict_metadata_v2_is_json_dumped(sm_mock):
    input_field = _submit(sm_mock, metadata_v2=METADATA_V2)
    assert json.loads(input_field['metadataJson']) == METADATA
    assert json.loads(input_field['metadataV2Json']) == METADATA_V2


def test_submit_str_metadata_v2_is_sent_as_is(sm_mock):
    raw = '{"schema_version": 2}'
    input_field = _submit(sm_mock, metadata_v2=raw)
    assert input_field['metadataV2Json'] == raw


def _update(inst, **kwargs):
    inst.update_dataset('ds-1', **kwargs)
    return inst._gqclient.update_dataset.call_args[0][1]


def test_update_without_metadata_v2_omits_key(sm_mock):
    input_field = _update(sm_mock, metadata=METADATA)
    assert json.loads(input_field['metadataJson']) == METADATA
    assert 'metadataV2Json' not in input_field


def test_update_metadata_v2_dict_and_str(sm_mock):
    assert json.loads(_update(sm_mock, metadata_v2=METADATA_V2)['metadataV2Json']) == METADATA_V2
    assert _update(sm_mock, metadata_v2='{"a": 1}')['metadataV2Json'] == '{"a": 1}'
