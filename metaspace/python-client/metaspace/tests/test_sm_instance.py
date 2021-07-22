import time
from copy import deepcopy
from pathlib import Path

import pytest

from metaspace import SMInstance
from metaspace.tests.utils import sm, my_ds_id, metadata

TEST_DATA_PATH = str((Path(__file__).parent / '../../../engine/tests/data').resolve())


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


@pytest.mark.skip('This test triggers processing and should only be run manually')
def test_submit_dataset(sm: SMInstance, metadata):
    time.sleep(1)  # Ensure no more than 1 DS per second is submitted to prevent errors

    new_ds_id = sm.submit_dataset(
        f'{TEST_DATA_PATH}/untreated/Untreated_3_434.imzML',
        f'{TEST_DATA_PATH}/untreated/Untreated_3_434.ibd',
        'Test dataset',
        metadata,
        False,
    )

    new_ds = sm.dataset(id=new_ds_id)
    assert new_ds.name == 'Test dataset'
    assert new_ds.polarity == 'Positive'
    assert set(new_ds.adducts) == {'+H', '+Na', '+K'}  # Ensure defaults were added


@pytest.mark.skip('This test triggers processing and should only be run manually')
def test_submit_dataset_clone(sm: SMInstance, my_ds_id, metadata):
    time.sleep(1)  # Ensure no more than 1 DS per second is submitted to prevent errors

    project_id = sm.projects.get_all_projects()[0]['id']
    new_ds_id = sm.submit_dataset(
        None,
        None,
        'Test clone dataset',
        metadata,
        False,
        [22, ('ChEBI', '2018-01')],
        project_ids=[project_id],
        adducts=['[M]+'],
        neutral_losses=['-H2O'],
        chem_mods=['+CO2'],
        ppm=2,
        num_isotopic_peaks=2,
        decoy_sample_size=10,
        analysis_version=2,
        input_path=sm.dataset(id=my_ds_id)._info['inputPath'],
        description='Test description\nNew line\n\nNew paragraph [{"\\escape characters',
    )

    new_ds = sm.dataset(id=new_ds_id)
    assert new_ds.name == 'Test clone dataset'
    assert new_ds.polarity == 'Positive'
    assert new_ds.adducts == ['[M]+']

    dbs = [dd['name'] for dd in new_ds.database_details]
    assert 'HMDB' in dbs
    assert 'ChEBI' in dbs
    assert new_ds.config['analysis_version'] == 2
    assert new_ds.config['isotope_generation']['n_peaks'] == 2
    assert new_ds.config['isotope_generation']['neutral_losses'] == ['-H2O']
    assert new_ds.config['isotope_generation']['chem_mods'] == ['+CO2']
    assert new_ds.config['fdr']['decoy_sample_size'] == 10
    assert new_ds.config['image_generation']['ppm'] == 2


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


@pytest.mark.skip('This test triggers reprocessing and should only be run manually')
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
