"""Unit tests for region-mask rasterisation helpers."""
import numpy as np

from sm.engine.postprocessing.experiment_masks import (
    rasterise_roi_mask,
    rasterise_segmentation_mask,
    rasterise_whole_mask,
)


def test_rasterise_roi_mask_polygon():
    geojson = {
        'features': [
            {
                'properties': {
                    'id': 7,
                    'coordinates': [
                        {'x': 0, 'y': 0},
                        {'x': 2, 'y': 0},
                        {'x': 2, 'y': 2},
                        {'x': 0, 'y': 2},
                    ],
                }
            }
        ]
    }
    mask = rasterise_roi_mask(geojson, roi_id=7, width=4, height=4)
    assert mask.shape == (4, 4)
    assert mask[0, 0] == 1 and mask[2, 2] == 1
    assert mask[3, 3] == 0


def test_rasterise_roi_mask_returns_none_when_id_absent():
    geojson = {'features': [{'properties': {'id': 1, 'coordinates': []}}]}
    assert rasterise_roi_mask(geojson, roi_id=99, width=2, height=2) is None


def test_rasterise_roi_mask_accepts_bare_feature_with_coordinates():
    """Production shape: a single GeoJSON Feature with properties.coordinates."""
    geojson = {
        'type': 'Feature',
        'properties': {
            'name': 'ROI 1',
            'coordinates': [
                {'x': 0, 'y': 0},
                {'x': 3, 'y': 0},
                {'x': 3, 'y': 3},
                {'x': 0, 'y': 3},
            ],
        },
        'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [3, 0], [3, 3], [0, 3]]]},
    }
    mask = rasterise_roi_mask(geojson, roi_id=130, width=4, height=4)
    assert mask is not None
    assert mask[0, 0] == 1 and mask[3, 3] == 1
    assert mask.sum() >= 9  # 4x4 polygon covers most of a 4x4 grid


def test_rasterise_roi_mask_falls_back_to_geometry_coordinates():
    """When properties.coordinates is absent, geometry.coordinates is used."""
    geojson = {
        'type': 'Feature',
        'properties': {},
        'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [2, 0], [2, 2], [0, 2]]]},
    }
    mask = rasterise_roi_mask(geojson, roi_id=1, width=4, height=4)
    assert mask is not None
    assert mask[0, 0] == 1 and mask[2, 2] == 1


def test_rasterise_segmentation_mask():
    label_map = np.array([[0, 1, 1], [2, 1, 0]], dtype=np.int32)
    mask = rasterise_segmentation_mask(label_map, segment_index=1)
    assert mask.tolist() == [[0, 1, 1], [0, 1, 0]]


def test_rasterise_whole_mask_uses_foreground():
    tic = np.array([[0.0, 1.5], [2.0, 0.0]], dtype=np.float32)
    mask = rasterise_whole_mask(tic)
    assert mask.tolist() == [[0, 1], [1, 0]]
