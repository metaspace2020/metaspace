import pytest
import numpy as np

from metaspace.sm_annotation_utils import IsotopeImages, SMDataset
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
