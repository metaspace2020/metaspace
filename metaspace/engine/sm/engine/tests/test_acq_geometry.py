import pytest
from unittest.mock import patch
from os.path import join

from sm.engine.acq_geometry import make_acq_geometry
from sm.engine.util import proj_root


class TestGeometryVariants(object):
    regular = {
        'max count of pixels x': 100,
        'max count of pixels y': 150,
        'pixel size x': 2,
        'pixel size y': 1
    }
    pix_count_only = {
        'max count of pixels x': 10,
        'max count of pixels y': 20,
    }
    empty = {}


@patch('pyimzml.ImzMLParser.ImzMLParser')
def test_ims_geometry_factory_regular(imzml_parser_mock):
    imzml_parser_mock().imzmldict = TestGeometryVariants.regular
    reg_geom = make_acq_geometry('ims', 'unused path')

    assert reg_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': TestGeometryVariants.regular['max count of pixels x'],
            'count_y': TestGeometryVariants.regular['max count of pixels y'],
            'spacing_x': TestGeometryVariants.regular['pixel size x'],
            'spacing_y': TestGeometryVariants.regular['pixel size y'],
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': TestGeometryVariants.regular['pixel size x'],
            'size_y': TestGeometryVariants.regular['pixel size y'],
        }
    }


@patch('pyimzml.ImzMLParser.ImzMLParser')
def test_ims_geometry_factory_pix_count(imzml_parser_mock):
    imzml_parser_mock().imzmldict = TestGeometryVariants.pix_count_only
    pix_count_geom = make_acq_geometry('ims', 'unused path')

    assert pix_count_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': TestGeometryVariants.pix_count_only['max count of pixels x'],
            'count_y': TestGeometryVariants.pix_count_only['max count of pixels y'],
            'spacing_x': 0,
            'spacing_y': 0,
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': 0,
            'size_y': 0,
        }
    }


@patch('pyimzml.ImzMLParser.ImzMLParser')
def test_ims_geometry_factory_pix_empty(imzml_parser_mock):
    imzml_parser_mock().imzmldict = TestGeometryVariants.empty
    empty_geom = make_acq_geometry('ims', 'unused path')

    assert empty_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': 0,
            'count_y': 0,
            'spacing_x': 0,
            'spacing_y': 0,
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': 0,
            'size_y': 0,
        }
    }


def test_ims_geometry_factory_real():
    ims_file_path = join(proj_root(), 'tests/data/imzml_example_ds/Example_Continuous.imzML')

    reg_geom = make_acq_geometry('ims', ims_file_path)

    assert reg_geom == {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': 3,
            'count_y': 3,
            'spacing_x': 100.0,
            'spacing_y': 100.0,
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': 100.0,
            'size_y': 100.0,
        }
    }


def test_lcms_geometry_factory():
    lcms_file_path = join(proj_root(), 'tests/data/lcms_acq_geometry_example/apple_surface_swab.mzML')

    geometry = make_acq_geometry('lcms', lcms_file_path)

    assert geometry['length_unit'] == 's'
    assert not geometry['acquisition_grid']['regular_grid']
    assert len(geometry['acquisition_grid']['coord_list']) == 285
    assert geometry['pixel_size'] == {
        'regular_size': True,
        'size_x': 0,
        'size_y': 0,
    }
