import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pytest
import numpy as np

from metaspace.sm_annotation_utils import (
    IsotopeImages,
    SMDataset,
    GraphQLClient,
    SMInstance,
    MolecularDB,
)
from metaspace.tests.utils import sm, my_ds_id, advanced_ds_id

EXPECTED_RESULTS_COLS = [
    'msm',
    'moc',
    'rhoSpatial',
    'rhoSpectral',
    'fdr',
    'mz',
    'moleculeNames',
    'moleculeIds',
    'intensity',
    'colocCoeff',
]


@pytest.fixture()
def dataset(sm, my_ds_id):
    return sm.dataset(id=my_ds_id)


@pytest.fixture()
def advanced_dataset(sm, advanced_ds_id):
    return sm.dataset(id=advanced_ds_id)


@pytest.fixture()
def downloadable_dataset_id(sm: SMInstance):
    OLD_DATASET_FIELDS = GraphQLClient.DATASET_FIELDS
    GraphQLClient.DATASET_FIELDS += ' canDownload'
    datasets = sm.datasets()
    GraphQLClient.DATASET_FIELDS = OLD_DATASET_FIELDS

    for ds in datasets:
        if ds._info['canDownload'] and ds._info['inputPath'].startswith('s3a:'):
            return ds.id


def test_annotations(dataset: SMDataset):
    annotations = dataset.annotations()

    assert len(annotations) > 0
    assert len(annotations[0]) == 2  # sf, adduct tuple


def test_results(dataset: SMDataset):
    annotations = dataset.results(database=('HMDB', 'v4'), fdr=0.5)

    assert len(annotations) > 0
    assert all(col in annotations.columns for col in EXPECTED_RESULTS_COLS)
    assert list(annotations.index.names) == ['formula', 'adduct']


def test_results_with_coloc(dataset: SMDataset):
    coloc_with = dataset.results(database=('HMDB', 'v4'), fdr=0.5).ion[0]
    coloc_annotations = dataset.results(database=('HMDB', 'v4'), fdr=0.5, coloc_with=coloc_with)

    assert len(coloc_annotations) > 0
    assert coloc_annotations.colocCoeff.all()


def test_results_with_int_database_id(dataset: SMDataset):
    annotations = dataset.results(22, fdr=0.5)

    assert len(annotations) > 0


def test_results_with_str_database_id(dataset: SMDataset):
    # The type of database IDs was up in the air for a while. Both ints and int-strings are accepted
    # and are converted to the correct form internally
    annotations = dataset.results('22', fdr=0.5)

    assert len(annotations) > 0


@patch(
    'metaspace.sm_annotation_utils.GraphQLClient.get_visible_databases',
    return_value=[{'id': '22', 'name': 'HMDB', 'version': 'v4'}],
)
@patch('metaspace.sm_annotation_utils.GraphQLClient.getAnnotations', return_value=[])
def test_map_database_works_handles_strs_ids_from_api(
    mock_getAnnotations, mock_get_databases, dataset: SMDataset
):
    # This test is just to ensure that the forward-compatibility with string IDs has the correct behavior
    dataset.results()

    print(mock_getAnnotations.call_args)
    annot_filter = mock_getAnnotations.call_args[1]['annotationFilter']
    assert annot_filter['databaseId'] == '22'


def test_results_neutral_loss_chem_mod(advanced_dataset: SMDataset):
    """
    Test setup: Create a dataset with a -H2O neutral loss and a -H+C chem mod.
    """
    annotations = advanced_dataset.results(database=('HMDB', 'v4'), fdr=0.5)
    annotations_cm = advanced_dataset.results(
        database=('HMDB', 'v4'), fdr=0.5, include_chem_mods=True
    )
    annotations_nl = advanced_dataset.results(
        database=('HMDB', 'v4'), fdr=0.5, include_neutral_losses=True
    )
    annotations_cm_nl = advanced_dataset.results(
        database=('HMDB', 'v4'), fdr=0.5, include_chem_mods=True, include_neutral_losses=True
    )

    # Check expected columns
    assert list(annotations_cm.index.names) == ['formula', 'adduct', 'chemMod']
    assert list(annotations_nl.index.names) == ['formula', 'adduct', 'neutralLoss']
    assert list(annotations_cm_nl.index.names) == ['formula', 'adduct', 'chemMod', 'neutralLoss']

    # Check CMs / NLs are present when explicitly included
    assert len(annotations_cm[annotations_cm.index.get_level_values('chemMod') != '']) > 0
    assert len(annotations_nl[annotations_nl.index.get_level_values('neutralLoss') != '']) > 0
    assert len(annotations_cm_nl[annotations_cm_nl.index.get_level_values('chemMod') != '']) > 0
    assert len(annotations_cm_nl[annotations_cm_nl.index.get_level_values('neutralLoss') != '']) > 0

    # Check CMs / NLs are excluded if they're not explicitly included
    assert annotations.index.is_unique
    assert annotations_cm.index.is_unique
    assert annotations_nl.index.is_unique
    assert annotations_cm_nl.index.is_unique
    assert len(annotations) < len(annotations_cm) < len(annotations_cm_nl)
    assert len(annotations) < len(annotations_nl) < len(annotations_cm_nl)
    plain_annotations = set(
        annotations_cm_nl.reset_index(['chemMod', 'neutralLoss'])[
            lambda df: (df.chemMod == '') & (df.neutralLoss == '')
        ].index
    )
    assert set(annotations.index) == plain_annotations


def test_isotope_images(dataset: SMDataset):
    sf, adduct = dataset.annotations(neutralLoss='', chemMod='')[0]

    images = dataset.isotope_images(sf, adduct)

    assert len(images) > 1
    assert isinstance(images[0], np.ndarray)


def test_isotope_images_advanced(advanced_dataset: SMDataset):
    sf, cm, nl, adduct = advanced_dataset.annotations(
        return_vals=('sumFormula', 'chemMod', 'neutralLoss', 'adduct'),
        neutralLoss='-H2O',
        chemMod='-H+C',
    )[0]

    images = advanced_dataset.isotope_images(sf, adduct, chem_mod=cm, neutral_loss=nl)

    assert len(images) > 1
    assert isinstance(images[0], np.ndarray)


def test_isotope_images_scaling(dataset: SMDataset):
    ann = dataset.results(neutralLoss='', chemMod='').iloc[0]
    formula, adduct = ann.name

    scaled_img = dataset.isotope_images(formula, adduct)[0]
    unscaled_img = dataset.isotope_images(formula, adduct, scale_intensity=False)[0]
    clipped_img = dataset.isotope_images(formula, adduct, hotspot_clipping=True)[0]
    clipped_unscaled_img = dataset.isotope_images(
        formula, adduct, scale_intensity=False, hotspot_clipping=True
    )[0]

    assert np.max(scaled_img) == pytest.approx(ann.intensity)
    assert np.max(unscaled_img) == pytest.approx(1)
    assert np.max(clipped_img) < ann.intensity
    assert np.max(clipped_img) > ann.intensity / 2  # Somewhat arbitrary, but generally holds true
    assert np.max(clipped_unscaled_img) == pytest.approx(1)


def test_all_annotation_images(dataset: SMDataset):
    image_list = dataset.all_annotation_images(only_first_isotope=True)

    assert isinstance(image_list[0], IsotopeImages)
    assert len(image_list) > 0
    assert all(len(isotope_images) == 1 for isotope_images in image_list)
    assert isinstance(image_list[0][0], np.ndarray)


def test_all_annotation_images_tic(dataset: SMDataset):
    image_list = dataset.all_annotation_images(
        only_first_isotope=True, scale_intensity='TIC', fdr=0.5
    )

    all_images = np.stack(images[0] for images in image_list if images[0] is not None)
    pixel_sums = np.sum(all_images, axis=0)
    pixel_sums = pixel_sums[~np.isnan(all_images[0])]
    # The sum of annotations generally shouldn't substantially exceed the TIC
    assert (pixel_sums < 1.5).all()
    assert (pixel_sums >= 0).all()  # There should be no negative values
    assert (pixel_sums > 0).any()  # There should be positive values


def test_all_annotation_images_advanced(advanced_dataset: SMDataset):
    image_list = advanced_dataset.all_annotation_images(only_first_isotope=True)

    # Assert images were returned for annotations with and without CMs / NLs
    assert any(isotope_images.chem_mod for isotope_images in image_list)
    assert any(not isotope_images.chem_mod for isotope_images in image_list)
    assert any(isotope_images.neutral_loss for isotope_images in image_list)
    assert any(not isotope_images.neutral_loss for isotope_images in image_list)


def test_download(sm: SMInstance, downloadable_dataset_id: str):
    # NOTE: In order to get a downloadable dataset, you will need to set your local installation
    # to upload to S3 and upload a dataset.
    dataset = sm.dataset(id=downloadable_dataset_id)

    with TemporaryDirectory() as tmpdir:
        dataset.download_to_dir(tmpdir, 'base_name')

        files = [f.name for f in Path(tmpdir).iterdir()]
        assert 'base_name.imzML' in files
        assert 'base_name.ibd' in files


def test_metadata(dataset: SMDataset):
    metadata = dataset.metadata

    # Make sure it behaves like a Dict
    assert 'Sample_Information' in metadata
    assert 'Sample_Preparation' in metadata
    assert 'MS_Analysis' in metadata

    assert len(metadata) > 0
    assert len(list(metadata.keys())) > 0

    # Make sure nested items work
    assert 'Organism' in metadata['Sample_Information']
    assert 'Xaxis' in metadata['MS_Analysis']['Pixel_Size']

    # Make sure it re-serializes in a way that matches the original JSON.
    # Use sort_keys to ensure they're both ordered the same way
    serialized = json.dumps(dataset.metadata, sort_keys=True)
    original_json = dataset.metadata.json  # type: ignore
    sorted_json = json.dumps(json.loads(original_json), sort_keys=True)

    assert serialized == sorted_json


def test_dataset_info_fields(dataset: SMDataset):
    # Ensures that the graphql query includes all fields required for these properties,
    # and that the TypedDicts have the right keys

    assert isinstance(dataset.id, str)
    assert isinstance(dataset.name, str)
    assert isinstance(dataset.s3dir, str)

    assert isinstance(dataset.config['database_ids'][0], int)
    assert isinstance(dataset.config['analysis_version'], int)
    assert isinstance(dataset.config['isotope_generation']['adducts'][0], str)
    assert isinstance(dataset.config['isotope_generation']['charge'], int)
    assert isinstance(dataset.config['isotope_generation']['isocalc_sigma'], float)
    assert isinstance(dataset.config['isotope_generation']['instrument'], str)
    assert isinstance(dataset.config['isotope_generation']['n_peaks'], int)
    assert isinstance(dataset.config['isotope_generation']['neutral_losses'], list)
    assert isinstance(dataset.config['isotope_generation']['chem_mods'], list)
    assert isinstance(dataset.config['fdr']['decoy_sample_size'], int)
    assert isinstance(dataset.config['image_generation']['ppm'], (int, float))
    assert isinstance(dataset.config['image_generation']['n_levels'], int)
    assert isinstance(dataset.config['image_generation']['min_px'], int)

    assert isinstance(dataset.adducts[0], str)

    assert dataset.polarity in ('Positive', 'Negative')

    assert isinstance(dataset.submitter['id'], str)
    assert isinstance(dataset.submitter['name'], str)

    assert isinstance(dataset.database_details[0], MolecularDB)
    assert isinstance(dataset.database_details[0].id, int)
    assert isinstance(dataset.database_details[0].name, str)
    assert isinstance(dataset.database_details[0].version, str)
    assert isinstance(dataset.database_details[0].is_public, bool)
    assert isinstance(dataset.database_details[0].archived, bool)

    # Accessing by the dict interface is deprecated, but still probably relied upon
    assert isinstance(dataset.database_details[0]['id'], int)
    assert isinstance(dataset.database_details[0]['name'], str)
    assert isinstance(dataset.database_details[0]['version'], str)
    assert isinstance(dataset.database_details[0]['isPublic'], bool)
    assert isinstance(dataset.database_details[0]['archived'], bool)

    assert isinstance(dataset.status, str)

    if len(dataset.projects) > 0:
        assert isinstance(dataset.projects[0]['id'], str)
        assert isinstance(dataset.projects[0]['name'], str)
        assert isinstance(dataset.projects[0]['publicationStatus'], str)
    else:
        print('Skipping check for dataset.projects fields as dataset has no projects')

    assert isinstance(dataset.group['id'], str)
    assert isinstance(dataset.group['name'], str)
    assert isinstance(dataset.group['shortName'], str)

    assert isinstance(dataset.principal_investigator, (str, type(None)))


def test_diagnostics(dataset: SMDataset):
    diagnostics = dataset.diagnostics()
    tic_diag = dataset.diagnostic('TIC')
    imzml_diag = dataset.diagnostic('IMZML_METADATA')
    tic_image = dataset.tic_image()

    assert any(diag['type'] == 'TIC' for diag in diagnostics)
    assert isinstance(tic_diag['images'][0]['image'], np.ndarray)
    assert imzml_diag is not None
    assert isinstance(tic_image, np.ndarray)
