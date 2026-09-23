import os

import pytest

from metaspace.sm_annotation_utils import GraphQLException, SMInstance
from metaspace.tests.utils import sm

# A small triangle near the origin -- safely inside any real dataset's ion-image grid.
SMALL_TRIANGLE = {
    'type': 'FeatureCollection',
    'features': [
        {
            'type': 'Feature',
            'properties': {'name': 'test_roi_import'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [0, 2], [2, 2]]]},
        }
    ],
}


@pytest.fixture()
def roi_ds_id(sm: SMInstance):
    """The dataset ID to run ROI tests against. Set METASPACE_TEST_DS_ID to pin a specific
    dataset, e.g.:
        METASPACE_TEST_DS_ID=2021-12-10_00h52m21s pytest metaspace/tests/test_roi.py
    Otherwise defaults to your first finished dataset (same lookup as the `my_ds_id` fixture
    in utils.py, done here separately so the env var skips it entirely rather than requiring
    at least one finished dataset to exist even when you've already named one).
    """
    ds_id = os.environ.get('METASPACE_TEST_DS_ID')
    if ds_id:
        return ds_id
    user_id = sm.current_user_id()
    datasets = sm.get_metadata({'submitter': user_id, 'status': 'FINISHED'})
    return datasets.index[0]


def _delete_roi(sm: SMInstance, roi_id):
    sm._gqclient.query('mutation ($id: ID!) { deleteRoi(id: $id) }', {'id': roi_id})


def test_get_rois_returns_a_list(sm: SMInstance, roi_ds_id):
    rois = sm.get_rois(roi_ds_id)
    print(rois)
    assert isinstance(rois, list)


def test_validate_roi_geojson_accepts_a_small_polygon(sm: SMInstance, roi_ds_id):
    result = sm.validate_roi_geojson(roi_ds_id, SMALL_TRIANGLE)
    print(result)

    assert result['valid'] is True
    assert result['roiCount'] == 1
    assert result['errors'] == []


def test_validate_roi_geojson_rejects_an_out_of_bounds_vertex(sm: SMInstance, roi_ds_id):
    out_of_bounds = {
        'type': 'Feature',
        'properties': {'name': 'out of bounds'},
        'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [0, 10**9], [10**9, 10**9]]]},
    }

    result = sm.validate_roi_geojson(roi_ds_id, out_of_bounds)
    print(result)

    assert result['valid'] is False
    assert result['roiCount'] == 0
    assert len(result['errors']) > 0


def test_import_rois_rejects_invalid_geojson(sm: SMInstance, roi_ds_id):
    try:
        sm.import_rois(roi_ds_id, '{"type": "LineString", "coordinates": []}')
        assert False, 'expected a GraphQLException'
    except GraphQLException:
        pass


def test_import_and_export_roundtrip(sm: SMInstance, roi_ds_id):
    imported = sm.import_rois(roi_ds_id, SMALL_TRIANGLE)
    try:
        print(imported)
        assert len(imported) == 1
        assert imported[0]['name'] == 'test_roi_import'

        exported = sm.export_rois(roi_ds_id)
        assert exported['type'] == 'FeatureCollection'
        assert exported['metadata']['datasetId'] == roi_ds_id
        names = [f['properties']['name'] for f in exported['features']]
        assert 'test_roi_import' in names
    finally:
        for roi in imported:
            _delete_roi(sm, roi['id'])
