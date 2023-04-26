from os.path import join

import pytest

from sm.engine.annotation.acq_geometry import make_acq_geometry, make_acq_geometry_lithops
from sm.engine.config import proj_root


def test_ims_geometry_factory_normal():
    metadata = {'MS_Analysis': {'Pixel_Size': {'Xaxis': 11, 'Yaxis': 22}}}
    empty_geom = make_acq_geometry('ims', 'unused path', metadata, (123, 456))

    assert empty_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {'regular_grid': True, 'count_x': 456, 'count_y': 123},
        'pixel_size': {'regular_size': True, 'size_x': 11, 'size_y': 22},
    }


def test_ims_geometry_factory_empty():
    metadata = {}
    empty_geom = make_acq_geometry('ims', 'unused path', metadata, (123, 456))

    assert empty_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {'regular_grid': True, 'count_x': 456, 'count_y': 123},
        'pixel_size': {'regular_size': True, 'size_x': None, 'size_y': None},
    }


@pytest.mark.skip(reason="pyopenms doesn't support Python 3.8")
def test_lcms_geometry_factory():
    lcms_file_path = join(
        proj_root(), 'tests/data/lcms_acq_geometry_example/apple_surface_swab.mzML'
    )

    geometry = make_acq_geometry('lcms', lcms_file_path, {}, (0, 0))

    assert geometry['length_unit'] == 's'
    assert not geometry['acquisition_grid']['regular_grid']
    assert len(geometry['acquisition_grid']['coord_list']) == 285
    assert geometry['pixel_size'] == {'regular_size': True, 'size_x': 1, 'size_y': 1}


def test_make_acq_geometry_lithops():
    metadata = {'MS_Analysis': {'Pixel_Size': {'Xaxis': 17, 'Yaxis': 18}}}

    empty_geom = make_acq_geometry_lithops(metadata, (72, 70), 4850)

    assert empty_geom == {
        'length_unit': 'nm',
        'pixel_count': 4850,
        'acquisition_grid': {'regular_grid': True, 'count_x': 70, 'count_y': 72},
        'pixel_size': {'regular_size': True, 'size_x': 17, 'size_y': 18},
    }
