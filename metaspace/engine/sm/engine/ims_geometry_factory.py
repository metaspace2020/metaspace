from pyimzml.ImzMLParser import ImzMLParser
from sm.engine.acq_geometry_factory import AcqGeometryFactory, ACQ_GEOMETRY_KEYS

class ImsGeometryFactory(AcqGeometryFactory):
    def __init__(self, ms_file_path):
        super(ImsGeometryFactory, self).__init__(ms_file_path)
        self.parser = ImzMLParser(ms_file_path)

    def _acquisition_grid(self):
        grid_props = self.parser.imzmldict
        # assuming pixels are next to each other, so spacing is equal to pixel dimensions
        return {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : grid_props.get('max count of pixels x', 0),
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : grid_props.get('max count of pixels y', 0),
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : grid_props.get('pixel size x', 0.0),
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : grid_props.get('pixel size y', 0.0)
        }

    def _pixel_shape(self):
        grid_props = self.parser.imzmldict
        return {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : grid_props.get('pixel size x', 0.0),
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : grid_props.get('pixel size y', 0.0)
        }

    def _length_unit(self):
        return 'nm'
