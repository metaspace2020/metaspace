import pytest
from metaspace.tests.utils import sm, my_ds_id


def test_add_dataset_external_link(sm, my_ds_id):
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.add_dataset_external_link(my_ds_id, provider, link)

    assert any(ext_link == {'provider': provider, 'link': link} for ext_link in result)


def test_remove_dataset_external_link(sm, my_ds_id):
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.remove_dataset_external_link(my_ds_id, provider, link)

    assert not any(ext_link == {'provider': provider, 'link': link} for ext_link in result)


def test_datasets_by_id(sm, my_ds_id):
    result = sm.datasets(idMask=[my_ds_id])

    assert len(result) == 1
    assert result[0].id == my_ds_id


def test_datasets_by_name(sm, my_ds_id):
    ds_name = sm.datasets(idMask=[my_ds_id])[0].name  # assuming this works

    result = sm.datasets(nameMask=ds_name)

    assert len(result) > 0
    assert any(r.name == ds_name for r in result)


def test_datasets_by_project(sm):
    project_id = [p['id'] for p in sm.projects.get_all_projects() if p['numDatasets'] > 0][0]
    print(sm.projects.get_all_projects())
    print(project_id)

    result = sm.datasets(project=project_id)

    print(result)
    assert len(result) > 0
