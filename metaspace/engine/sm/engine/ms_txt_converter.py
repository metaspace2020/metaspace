"""

:synopsis: Converter of mass spec files into a text format accessible from pyspark

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from collections import Counter
from importlib import import_module
from os.path import exists
import logging
import numpy as np
import scipy.signal as signal
from sm.engine.errors import SMError
from pyMSpec.centroid_detection import gradient

from sm.engine.util import SMConfig


logger = logging.getLogger('engine')


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


def get_track_progress(points_n, steps_n, active=False):
    every_n = max(1, points_n // steps_n)

    def track(i):
        if i % every_n == 0:
            logger.debug("Wrote %.1f%% (%d of %d)" % (i / points_n * 100, i, points_n))

    def dont_track(i): pass

    return track if active else dont_track


class MsTxtConverter(object):
    """ Converts spectra from mass spec file formats to plain text files
    for later access from Spark using provided file parser

    Args
    ----
    ms_file_path : str
        Path to a mass spec data file
    txt_path : str
        Path to store spectra in plain text format
    coord_path : str
        Path to store spectra coordinates in plain text format
    """
    _parser_factory = None

    def __init__(self, ms_file_path, txt_path, coord_path=None):
        self.ms_file_path = ms_file_path

        if self._parser_factory is None:
            self._init_ms_parser_factory()

        self.preprocess = None

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

        self.txt_file.write(encode_data_line(i, mzs[ints > 0], ints[ints > 0], decimals=9) + '\n')
        if self.coord_file:
            self.coord_file.write(encode_coord_line(i, x, y) + '\n')

    def _init_ms_parser_factory(self):
        ms_file_type_config = SMConfig.get_ms_file_handler(self.ms_file_path)
        ms_parser_factory_module = ms_file_type_config['parser_factory']
        self._parser_factory = getattr(import_module(ms_parser_factory_module['path']), ms_parser_factory_module['name'])

    @staticmethod
    def _check_coord_duplicates(coordinates):
        top_n_coord_counts = Counter(coordinates).most_common(100)
        most_common_coord_count = top_n_coord_counts[0][1]
        if most_common_coord_count > 1:
            coord_counts = {coo: cnt for coo, cnt in top_n_coord_counts if cnt > 1}
            logger.warning('Duplicated coordinates in ((x,y), n) format: {}'.format(coord_counts)[:1000])

    def convert(self, preprocess=False, print_progress=True):
        """
        Converts MS data provided by given parser to a text-based format.
        Optionally writes the coordinates into a coordinate file.

        Args
        ----
        preprocess : bool
            Apply filter and centroid detection to all spectra before writing (rarely useful)
        print_progress : bool
            Whether or not to print progress information to stdout
        """
        logger.info("MS -> Txt conversion")
        self.preprocess = preprocess

        if not exists(self.txt_path):
            self.txt_file = open(self.txt_path, 'w')
            self.coord_file = open(self.coord_path, 'w') if self.coord_path else None

            self.parser = self._parser_factory(self.ms_file_path)
            coordinates = [coo[:2] for coo in self.parser.coordinates]
            self._check_coord_duplicates(coordinates)

            pixels_n = len(coordinates)
            track_progress = get_track_progress(points_n=pixels_n, steps_n=10, active=print_progress)

            logger.info('Converting %s spectra', pixels_n)
            for i, (x, y) in enumerate(coordinates):
                try:
                    self.parse_save_spectrum(i, x, y)
                    track_progress(i)
                except Exception as e:
                    logger.error('Spectrum parsing failed i=%s, x=%s y=%s: %s', i, x, y, e)
                    raise

            self.txt_file.close()
            if self.coord_file:
                self.coord_file.close()

            logger.info("Conversion finished successfully")
        else:
            logger.info('File %s already exists', self.txt_path)
