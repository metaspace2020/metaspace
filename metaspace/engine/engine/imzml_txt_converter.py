"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import json
import sys
from os.path import exists

import numpy as np
import scipy.signal as signal
from pyimzml.ImzMLParser import ImzMLParser

from engine.db import DB
from engine.util import SMConfig, logger
from pyMS.centroid_detection import gradient


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


class ImageBounds(object):
    """ Keeps track of min, max coordinate values for x, y axis """
    def __init__(self):
        self.min_x, self.min_y = sys.maxint, sys.maxint
        self.max_x, self.max_y = -sys.maxint, -sys.maxint

    def update(self, x, y):
        self.min_x, self.min_y = min(self.min_x, x), min(self.min_y, y)
        self.max_x, self.max_y = max(self.max_x, x), max(self.max_y, y)

    def to_json(self):
        return json.dumps({'x': {'min': self.min_x, 'max': self.max_x},
                           'y': {'min': self.min_y, 'max': self.max_y}})


DS_ID_SELECT = "SELECT id FROM dataset where name = %s"
MAX_DS_ID_SELECT = "SELECT COALESCE(MAX(id), -1) FROM dataset"
DS_INSERT = "INSERT INTO dataset VALUES (%s, %s, %s, %s)"
COORD_INSERT = "INSERT INTO coordinates VALUES (%s, %s, %s)"


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
        self.image_bounds = None
        self.sm_config = SMConfig.get_conf()

        self.txt_path = txt_path
        self.coord_path = coord_path
        self.txt_file = None
        self.coord_file = None

        self.parser = None
        self.image_bounds = ImageBounds()

    def parse_save_spectrum(self, i, x, y):
        """ Parse and save to files spectrum with index i and its coordinates x,y"""
        mzs, ints = map(np.array, self.parser.getspectrum(i))
        if self.preprocess:
            mzs, ints = preprocess_spectrum(mzs, ints)

        self.txt_file.write(encode_data_line(i, mzs, ints, decimals=9) + '\n')
        if self.coord_file:
            self.coord_file.write(encode_coord_line(i, x, y) + '\n')

    def save_ds_meta(self):
        """ Save dataset metadata (name, path, image bounds, coordinates) to the database """
        db = DB(self.sm_config['db'])
        try:
            ds_id_row = db.select_one(DS_ID_SELECT, self.ds_name)
            if not ds_id_row:
                logger.info('No dataset with name %s found', self.ds_name)
                ds_id = db.select_one(MAX_DS_ID_SELECT)[0] + 1

                logger.info("Inserting to the dataset table: %d", ds_id)
                db.insert(DS_INSERT, [(ds_id, self.ds_name, self.imzml_path, self.image_bounds.to_json())])

                logger.info("Inserting to the coordinates table")
                with open(self.coord_path) as f:
                    coord_tuples = map(lambda s: map(int, s.split(',')), f.readlines())
                    _, xs, ys = map(list, zip(*coord_tuples))
                    db.insert(COORD_INSERT, [(ds_id, xs, ys)])
        finally:
            db.close()

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

            for i, coord in enumerate(self.parser.coordinates):
                x, y = coord[:2]
                self.image_bounds.update(x, y)
                self.parse_save_spectrum(i, x, y)
                track_progress(i)

            self.txt_file.close()
            if self.coord_file:
                self.coord_file.close()

            self.save_ds_meta()

            logger.info("Conversion finished successfully")
        else:
            logger.info('File %s already exists', self.txt_path)

