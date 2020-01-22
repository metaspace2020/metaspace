from os import path
from pathlib import Path

import pytest
from metaspace.sm_annotation_utils import SMInstance


@pytest.fixture()
def sm():
    return SMInstance(config_path=path.join(path.dirname(__file__), '../../test_config'))


@pytest.fixture()
def my_ds_id(sm):
    user_id = sm.current_user_id()
    datasets = sm.get_metadata({'submitter': user_id})
    return datasets.index[0]


def test_add_dataset_external_link(sm, my_ds_id):
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.add_dataset_external_link(my_ds_id, provider, link)

    assert any(ext_link == {'provider': provider, 'link': link} for ext_link in result)


def test_remove_project_external_link(sm, my_ds_id):
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.remove_dataset_external_link(my_ds_id, provider, link)

    assert not any(ext_link == {'provider': provider, 'link': link} for ext_link in result)
