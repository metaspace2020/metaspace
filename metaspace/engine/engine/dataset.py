import json

import numpy as np
from codecs import open

from engine.util import local_path, hdfs_path, logger, SMConfig


DS_ID_SELECT = "SELECT id FROM dataset where name = %s"
DS_DEL = "DELETE FROM dataset where name = %s"
# MAX_DS_ID_SELECT = "SELECT COALESCE(MAX(id), -1) FROM dataset"
DS_INSERT = "INSERT INTO dataset (name, file_path, img_bounds, config) VALUES (%s, %s, %s, %s)"
COORD_INSERT = "INSERT INTO coordinates VALUES (%s, %s, %s)"


class Dataset(object):
    """ A class representing a mass spectrometry dataset. Backed by a couple of plain text files containing
    coordinates and spectra.

    Args
    ----------
    sc : pyspark.SparkContext
        Spark context object
    name : String
        Dataset name
    ds_config : dict
        Dataset config file
    work_dir : engine.work_dir.WorkDir
    db : engine.db.DB
    """
    def __init__(self, sc, name, ds_config, work_dir, db):
        self.db = db
        self.sc = sc
        self.name = name
        self.ds_config = ds_config
        self.work_dir = work_dir
        self.sm_config = SMConfig.get_conf()

        self._define_pixels_order()

    @staticmethod
    def _parse_coord_row(s):
        res = []
        row = s.strip('\n')
        if len(row) > 0:
            vals = row.split(',')
            if len(vals) > 0:
                res = map(int, vals)[1:]
        return res

    def _define_pixels_order(self):
        if self.sm_config['fs']['local']:
            coord_path = local_path(self.work_dir.coord_path)
        else:
            coord_path = hdfs_path(self.work_dir.coord_path)

        self.coords = self.sc.textFile(coord_path).map(self._parse_coord_row).filter(lambda t: len(t) == 2).collect()
        self.min_x, self.min_y = np.amin(np.asarray(self.coords), axis=0)
        self.max_x, self.max_y = np.amax(np.asarray(self.coords), axis=0)

        _coord = np.array(self.coords)
        _coord = np.around(_coord, 5)  # correct for numerical precision
        _coord -= np.amin(_coord, axis=0)

        ncols = self.max_x - self.min_x + 1
        pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
        pixel_indices = pixel_indices.astype(np.int32)
        self.norm_img_pixel_inds = pixel_indices

    def get_norm_img_pixel_inds(self):
        """
        Returns
        -------
        : ndarray
            One-dimensional array of indexes for dataset pixels taken in row-wise manner
        """
        return self.norm_img_pixel_inds

    def get_dims(self):
        """
        Returns
        -------
        : tuple
            A pair of int values. Number of rows and columns
        """
        return (self.max_y - self.min_y + 1,
                self.max_x - self.min_x + 1)

    @staticmethod
    def txt_to_spectrum(s):
        """Converts a text string in the format to a spectrum in the form of two arrays:
        array of m/z values and array of partial sums of intensities.

        Args
        ----------
        s : String
            id|mz1 mz2 ... mzN|int1 int2 ... intN
        Returns
        -------
        : tuple
            triple spectrum_id, mzs, cumulative sum of intensities
        """
        arr = s.strip().split("|")
        intensities = np.fromstring("0 " + arr[2], sep=' ')
        return int(arr[0]), np.fromstring(arr[1], sep=' '), np.cumsum(intensities)

    def get_spectra(self):
        """
        Returns
        -------
        : pyspark.rdd.RDD
            Spark RDD with spectra. One spectrum per RDD entry.
        """
        txt_to_spectrum = self.txt_to_spectrum
        if self.sm_config['fs']['local']:
            logger.info('Converting txt to spectrum rdd from %s', local_path(self.work_dir.txt_path))
            return self.sc.textFile(local_path(self.work_dir.txt_path)).map(txt_to_spectrum)
        else:
            logger.info('Converting txt to spectrum rdd from %s', hdfs_path(self.work_dir.txt_path))
            return self.sc.textFile(hdfs_path(self.work_dir.txt_path), minPartitions=8).map(txt_to_spectrum)

    def save_ds_meta(self):
        """ Save dataset metadata (name, path, image bounds, coordinates) to the database """
        # ds_id_row = self.db.select_one(DS_ID_SELECT, self.name)
        # if not ds_id_row:
        #     logger.info('No dataset with name %s found', self.name)

        # ds_id = self.db.select_one(MAX_DS_ID_SELECT)[0] + 1
        self.db.alter(DS_DEL, self.name)
        img_bounds = json.dumps({'x': {'min': self.min_x, 'max': self.max_x},
                                 'y': {'min': self.min_y, 'max': self.max_y}})
        ds_config_json = json.dumps(self.ds_config)
        ds_row = [(self.name, self.work_dir.imzml_path, img_bounds, ds_config_json)]
        self.db.insert(DS_INSERT, ds_row)

        ds_id = self.db.select(DS_ID_SELECT, self.name)[0]
        logger.info("Inserted into the dataset table: %s, %s", ds_id, self.name)

        xs, ys = map(list, zip(*self.coords))
        self.db.insert(COORD_INSERT, [(ds_id, xs, ys)])
        logger.info("Inserted to the coordinates table")
