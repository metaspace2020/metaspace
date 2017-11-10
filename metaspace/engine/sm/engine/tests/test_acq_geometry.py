import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from pyimzml.ImzMLParser import ImzMLParser
from os.path import join, dirname

from sm.engine.acq_geometry_factory import ACQ_GEOMETRY_KEYS
from sm.engine.ims_geometry_factory import ImsGeometryFactory
from sm.engine.lcms_geometry_factory import LcmsGeometryFactory


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


def test_ims_geometry_factory():
    imzml_parser_mock = MagicMock(ImzMLParser)
    imzml_parser_mock.imzmldict = TestGeometryVariants.regular

    factory_reg_geom = ImsGeometryFactory('mocked_file')
    factory_reg_geom.parser = imzml_parser_mock

    assert factory_reg_geom.create() == {
        ACQ_GEOMETRY_KEYS.LENGTH_UNIT: 'nm',
        ACQ_GEOMETRY_KEYS.AcqGridSection.section_name: {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : TestGeometryVariants.regular['max count of pixels x'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : TestGeometryVariants.regular['max count of pixels y'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : TestGeometryVariants.regular['pixel size x'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : TestGeometryVariants.regular['pixel size y']
        },
        ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name: {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : TestGeometryVariants.regular['pixel size x'],
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : TestGeometryVariants.regular['pixel size y']
        }
    }

    imzml_parser_mock.imzmldict = TestGeometryVariants.pix_count_only
    factory_pix_count_geom = ImsGeometryFactory('mocked_file')
    factory_pix_count_geom.parser = imzml_parser_mock

    assert factory_pix_count_geom.create() == {
        ACQ_GEOMETRY_KEYS.LENGTH_UNIT: 'nm',
        ACQ_GEOMETRY_KEYS.AcqGridSection.section_name: {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : TestGeometryVariants.pix_count_only['max count of pixels x'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : TestGeometryVariants.pix_count_only['max count of pixels y'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : 0,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : 0
        },
        ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name: {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : 0,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : 0
        }
    }

    imzml_parser_mock.imzmldict = TestGeometryVariants.empty
    factory_empty_geom = ImsGeometryFactory('mocked_file')
    factory_empty_geom.parser = imzml_parser_mock

    assert factory_empty_geom.create() == {
        ACQ_GEOMETRY_KEYS.LENGTH_UNIT: 'nm',
        ACQ_GEOMETRY_KEYS.AcqGridSection.section_name: {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : 0,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : 0,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : 0,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : 0
        },
        ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name: {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : 0,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : 0
        }
    }

def test_lcms_geometry_factory():
    proj_dir_path = dirname(dirname(dirname(__file__)))
    lcms_file_path = join(proj_dir_path, 'tests/data/lcms_acq_geometry_example/apple_surface_swab.mzML')
    factory = LcmsGeometryFactory(lcms_file_path)

    geometry = factory.create()
    assert geometry[ACQ_GEOMETRY_KEYS.LENGTH_UNIT] == 's'
    assert not geometry[ACQ_GEOMETRY_KEYS.AcqGridSection.section_name][ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID]
    assert len(geometry[ACQ_GEOMETRY_KEYS.AcqGridSection.section_name][ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_CORRD_LIST]) == 1590
    assert geometry[ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name] == {
        ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
        ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : 0,
        ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : 0
    }
