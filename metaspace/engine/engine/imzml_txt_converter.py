"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from os.path import exists
import numpy as np
import scipy.signal as signal
from pyimzml.ImzMLParser import ImzMLParser

from engine.util import SMConfig, logger
from pyMSpec.centroid_detection import gradient


def preprocess_spectrum(mzs, ints):
    ints = signal.savgol_filter(ints, 5, 2)
    mzs, ints, _ = gradient(np.asarray(mzs), np.asarray(ints), max_output=-1, weighted_bins=3)
    order = mzs.argsort()
    return mzs[order], ints[order]


def to_space_separated_string(seq):
    return ' '.join(map(str, seq.tolist()))


def encode_data_line(index, mzs, ints, decimals=3):
    """ Encodes given spectrum into a line in a text-based format:
    "index|int_1 int_2 ... int_n|mz_1 mz_2 ... mz_n"
    """
    if not isinstance(index, int):
        raise TypeError("index must be integer")
    idx_string = str(index)
    mzs = mzs.round(decimals)
    ints = ints.round(decimals)
    mz_string = to_space_separated_string(mzs)
    int_string = to_space_separated_string(ints)
    return "%s|%s|%s" % (idx_string, mz_string, int_string)


def encode_coord_line(index, x, y):
    """ Encodes given coordinate into a csv line: "index,x,y" """
    if not (isinstance(index, int) and isinstance(x, int) and isinstance(y, int)):
        raise TypeError("parameters must be integer")
    return "%d,%d,%d" % (index, x, y)


def get_track_progress(n_points, step, active=False):
    def track(i):
        if i % step == 0:
            print("Wrote %.1f%% (%d of %d)" % (float(i) / n_points * 100, i, n_points))

    def dont_track(i): pass

    return track if active else dont_track


class ImzmlTxtConverter(object):
    """ Converts spectra from imzML/ibd to plain text files for later access from Spark

    Args
    ----
    ds_name : str
        Dataset name (alias)
    imzml_path : str
        Path to an imzML file
    txt_path : str
        Path to store spectra in plain text format
    coord_path : str
        Path to store spectra coordinates in plain text format
    """
    def __init__(self, ds_name, imzml_path, txt_path, coord_path=None):
        self.ds_name = ds_name
        self.imzml_path = imzml_path
        self.preprocess = None
        self.sm_config = SMConfig.get_conf()
        self.coord_set = set()

        self.txt_path = txt_path
        self.coord_path = coord_path
        self.txt_file = None
        self.coord_file = None

        self.parser = None

    def parse_save_spectrum(self, i, x, y):
        """ Parse and save to files spectrum with index i and its coordinates x,y"""
        mzs, ints = map(np.array, self.parser.getspectrum(i))
        if self.preprocess:
            mzs, ints = preprocess_spectrum(mzs, ints)

        self.txt_file.write(encode_data_line(i, mzs, ints, decimals=9) + '\n')
        if self.coord_file:
            self.coord_file.write(encode_coord_line(i, x, y) + '\n')

    def _uniq_coord(self, x, y):
        if (x, y) in self.coord_set:
            logger.warning('Duplicated x,y = ({},{}) pair'.format(x, y))
            return False
        self.coord_set.add((x, y))
        return True

    def convert(self, preprocess=False, print_progress=True):
        """
        Converts MS imaging data provided by given parser to a text-based
        format. Optionally writes the coordinates into a coordinate file.

        Args
        ----
        preprocess : bool
            Apply filter and centroid detection to all spectra before writing (rarely useful)
        print_progress : bool
            Whether or not to print progress information to stdout
        """
        logger.info("ImzML -> Txt conversion...")
        self.preprocess = preprocess

        if not exists(self.txt_path):
            self.txt_file = open(self.txt_path, 'w')
            self.coord_file = open(self.coord_path, 'w') if self.coord_path else None

            self.parser = ImzMLParser(self.imzml_path)

            n_pixels = len(self.parser.coordinates)
            track_progress = get_track_progress(n_pixels, max(n_pixels / 100, 100), print_progress)

            i = 0
            for i, coord in enumerate(self.parser.coordinates):
                x, y = coord[:2]
                self._uniq_coord(x, y)
                self.parse_save_spectrum(i, x, y)
                track_progress(i)

            self.txt_file.close()
            if self.coord_file:
                self.coord_file.close()

            logger.info("Conversion finished successfully")
        else:
            logger.info('File %s already exists', self.txt_path)

