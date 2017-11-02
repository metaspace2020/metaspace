from pyimzml.ImzMLParser import ImzMLParser
from acq_geometry_factory import AcqGeometryFactory

class ImsGeometryFactory(AcqGeometryFactory):
    def __init__(self, ms_file_path):
        super().__init__(ms_file_path)
        parser = ImzMLParser(ms_file_path)

    def _is_regular_grid(self):
        return True

    def _acquisition_grid(self):
        grid_props = parser.ìmzmldict
        return {
            GeometryCalculatorKeys.PIXEL_COUNT_X : grid_props['max count of pixels x']
            GeometryCalculatorKeys.PIXEL_COUNT_Y : grid_props['max count of pixels y']
            GeometryCalculatorKeys.PIXEL_SPACING_X : grid_props['pixel size x']
            GeometryCalculatorKeys.PIXEL_SPACING_Y : grid_props['pixel size y']
        }

    def is_regular_pixel_shape(self):
        return True

    def pixel_shape(self):
        return {
            GeometryCalculatorKeys.PIXEL_SIZE_X : float
            GeometryCalculatorKeys.PIXEL_SIZE_Y : float
        }

    def distance_unit(self):
        return 'nanometer'
