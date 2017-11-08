""" Interface for generating an object describing geometry of mass spec acquisition process.
"""

def geometry_section(section_name):
    """ Class decorator adding static property @section_name with the input value to a decorated class
    """
    def modifier(cls):
        cls.section_name = section_name
        return cls
    return modifier


class ACQ_GEOMETRY_KEYS(object):
    ''' Collection of identifiers served as keys in objects
    describing mass spec acquisition geometry.
    '''

    @geometry_section('acquisition_grid')
    class AcqGridSection(object):
        REGULAR_GRID = 'regular_grid'
        PIXEL_COUNT_X = 'count_x'
        PIXEL_COUNT_Y = 'count_y'
        PIXEL_SPACING_X = 'spacing_x'
        PIXEL_SPACING_Y = 'spacing_y'
        PIXEL_CORRD_LIST = 'coord_list'

    @geometry_section('pixel_size')
    class PixelSizeSection(object):
        REGULAR_SIZE = 'regular_size'
        PIXEL_SIZE_X = 'size_x'
        PIXEL_SIZE_Y = 'size_y'
        PIXEL_SIZE_LIST = 'size_list'

    LENGTH_UNIT = 'length_unit'


class AcqGeometryFactory(object):
    """ Interface for generating an object describing
    geometry of mass spec acquisition process.

    In the comments below all coordinates are assumed to be calculated
    relatively to top left corner of the acquisition area.
    """

    def __init__(self, ms_file_path):
        self.ms_file_path = ms_file_path
        self.geometry = {}

    def create(self):
        """ Generates acquisition geometry descriptor """
        if not self.geometry:
            self.geometry = {
                ACQ_GEOMETRY_KEYS.LENGTH_UNIT: self._length_unit(),
                ACQ_GEOMETRY_KEYS.AcqGridSection.section_name: self._acquisition_grid(),
                ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name: self._pixel_shape()
            }
        return self.geometry

    def _acquisition_grid(self):
        """ Object with the following structure:
        if @self._is_regular_grid == True:
        {
            AcqGridSection.REGULAR_GRID : true
            # count of pixels along X axis
            AcqGridSection.PIXEL_COUNT_X : int
            # count of pixels along Y axis
            AcqGridSection.PIXEL_COUNT_Y : int
            # distance between pixel centers along X axis
            AcqGridSection.PIXEL_SPACING_X : float
            # distance between pixel centers along Y axis
            AcqGridSection.PIXEL_SPACING_Y : float
        }
        else: list of coordinates of pixel centers
        {
            AcqGridSection.REGULAR_GRID : false
            AcqGridSection.PIXEL_CORRD_LIST : [(x, y)]
        }
        """
        raise NotImplementedError

    def _pixel_shape(self):
        """ Object with the following structure:
        if @self.is_regular_pixel_shape == True:
        {
            PixelSizeSection.REGULAR_SIZE : true
            # pixel size along X axis
            PixelSizeSection.PIXEL_SIZE_X : float
            # pixel size along Y axis
            PixelSizeSection.PIXEL_SIZE_Y : float
        }
        else: list of pixel sizes
        {
            PixelSizeSection.REGULAR_SIZE : false
            PixelSizeSection.PIXEL_SIZE_LIST : [(x_size, y_size)]
        }
        """
        raise NotImplementedError

    def _length_unit(self):
        """ String identifier of units of distance used in @self.acquisition_grid and @self.pixel_shape """
        raise NotImplementedError
