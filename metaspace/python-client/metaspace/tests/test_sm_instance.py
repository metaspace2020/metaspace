import time
from copy import deepcopy

import pytest

from metaspace import SMInstance
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


def test_datasets_by_all_fields(sm: SMInstance):
    project_id = [p['id'] for p in sm.projects.get_all_projects() if p['numDatasets'] > 0][0]

    # If anything is broken with the GraphQL mapping, this will throw an exception
    sm.datasets(
        nameMask='foo',
        idMask='foo',
        submitter_id=sm.current_user_id(),
        group_id=sm._gqclient.get_primary_group_id(),
        project=project_id,
        polarity='Positive',
        ionisation_source='MALDI',
        analyzer_type='Orbitrap',
        maldi_matrix='DHB',
        organism='Human',
        organismPart='Cells',
    )


def test_update_dataset_without_reprocessing(sm: SMInstance, my_ds_id):
    old_ds = sm.dataset(id=my_ds_id)
    new_name = 'foo' if old_ds.name != 'foo' else 'bar'
    metadata = deepcopy(old_ds.metadata)
    metadata['Sample_Information']['Organism'] = new_name

    sm.update_dataset(id=my_ds_id, name=new_name, metadata=metadata)

    # Wait for reindexing, as dataset updates are async
    attempts = 0
    while sm.dataset(id=my_ds_id).name != new_name and attempts < 10:
        time.sleep(1)
        attempts += 1

    assert sm.dataset(id=my_ds_id).name == new_name


# @pytest.mark.skip('This test triggers reprocessing and should only be run manually')
def test_update_dataset_with_auto_reprocessing(sm: SMInstance, my_ds_id):
    old_ds = sm.dataset(id=my_ds_id)
    new_adducts = ['+H'] if old_ds.adducts != ['+H'] else ['+K']

    assert old_ds.status == 'FINISHED'

    sm.update_dataset(id=my_ds_id, adducts=new_adducts)

    # Wait for dataset to change status
    attempts = 0
    while sm.dataset(id=my_ds_id).status != 'FINISHED' and attempts < 10:
        time.sleep(1)
        attempts += 1

    assert sm.dataset(id=my_ds_id).status in ('QUEUED', 'ANNOTATING')
