from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import numpy as np

from metaspace.sm_annotation_utils import IsotopeImages, SMDataset, GraphQLClient, SMInstance
from metaspace.tests.utils import sm, my_ds_id


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
    # Test normal config
    annotations = dataset.results('HMDB-v4', fdr=0.5)

    assert len(annotations) > 0
    assert all(col in annotations.columns for col in EXPECTED_RESULTS_COLS)

    # Test with colocalization
    coloc_with = annotations.ion[0]
    coloc_annotations = dataset.results('HMDB-v4', fdr=0.5, coloc_with=coloc_with)

    assert len(coloc_annotations) > 0
    assert coloc_annotations.colocCoeff.all()


def test_isotope_images(dataset: SMDataset):
    sf, adduct = dataset.annotations()[0]

    images = dataset.isotope_images(sf, adduct)

    assert len(images) > 1
    assert isinstance(images[0], np.ndarray)


def test_all_annotation_images(dataset: SMDataset):
    image_list = dataset.all_annotation_images(only_first_isotope=True)

    assert isinstance(image_list[0], IsotopeImages)
    assert len(image_list) > 0
    assert all(len(isotope_images) == 1 for isotope_images in image_list)
    assert isinstance(image_list[0][0], np.ndarray)


def test_download(sm: SMInstance, downloadable_dataset_id: str):
    # NOTE: In order to get a downloadable dataset, you will need to set your local installation
    # to upload to S3 and upload a dataset.
    dataset = sm.dataset(id=downloadable_dataset_id)

    with TemporaryDirectory() as tmpdir:
        dataset.download_to_dir(tmpdir, 'base_name')

        files = [f.name for f in Path(tmpdir).iterdir()]
        assert 'base_name.imzML' in files
        assert 'base_name.ibd' in files
