from pyimzml.ImzMLParser import ImzMLParser
from sm.engine.acq_geometry_factory import AcqGeometryFactory, ACQ_GEOMETRY_KEYS

class ImsGeometryFactory(AcqGeometryFactory):
    def __init__(self, ms_file_path):
        super(ImsGeometryFactory, self).__init__(ms_file_path)
        parser = ImzMLParser(ms_file_path)

    def _acquisition_grid(self):
        grid_props = self.parser.ìmzmldict
        # assuming pixels are next to each other, so spacing is equal to pixel dimensions
        return {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : grid_props['max count of pixels x'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : grid_props['max count of pixels y'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : grid_props['pixel size x'],
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : grid_props['pixel size y']
        }

    def _pixel_shape(self):
        return {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : grid_props['pixel size x'],
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : grid_props['pixel size y']
        }

    def _length_unit(self):
        return 'nm'
