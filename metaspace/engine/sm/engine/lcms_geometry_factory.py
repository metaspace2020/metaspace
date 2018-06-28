from sm.engine.acq_geometry_factory import AcqGeometryFactory, ACQ_GEOMETRY_KEYS
from sm.engine.mzml_reading import read_ms1_experiment

class LcmsGeometryFactory(AcqGeometryFactory):
    def __init__(self, ms_file_path):
        super(LcmsGeometryFactory, self).__init__(ms_file_path)

    def _acquisition_grid(self):
        ms_experiment = read_ms1_experiment(self.ms_file_path)
        pixel_coords = [(spec.getRT(), 0.0) for spec in ms_experiment]
        return {
            ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: False,
            ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_CORRD_LIST: pixel_coords
        }

    def _pixel_shape(self):
        return {
            ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : 0,
            ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : 0
        }

    def _length_unit(self):
        return 's'
