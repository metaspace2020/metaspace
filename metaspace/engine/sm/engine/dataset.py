import json
import numpy as np
import logging

from sm.engine.util import SMConfig, read_json


logger = logging.getLogger('sm-engine')

DS_INSERT = "INSERT INTO dataset (id, name, input_path, metadata, img_bounds, config) VALUES (%s, %s, %s,%s, %s, %s)"
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
    wd_manager : engine.local_dir.WorkDir
    db : engine.db.DB
    """
    def __init__(self, sc, id, name, drop, input_path, wd_manager, db):
        self.db = db
        self.sc = sc
        self.wd_manager = wd_manager
        self.sm_config = SMConfig.get_conf()

        self.id = id
        self.name = name
        self.input_path = input_path

        if drop:
            self._delete_ds_if_exists(self.name)

    def read_ds_config_meta(self):
        self._define_pixels_order()
        self._read_ds_config_metadata()
        self._update_ds_meta()

    def _read_ds_config_metadata(self):
        ds_r = self.db.select('SELECT name, config, metadata FROM dataset WHERE id=%s', self.id)
        if ds_r:
            self.name, self.ds_config, self.metadata = ds_r[0]
            logger.info("Dataset %s, %s already exists", self.id, self.name)
        else:
            self.ds_config = read_json(self.wd_manager.ds_config_path)
            self.metadata = read_json(self.wd_manager.ds_metadata_path)

            if not self.name:
                self.name = self.metadata.get('metaspace_options', {}).get('Dataset_Name', self.id)

    def _delete_ds_if_exists(self, name):
        for r in self.db.select('SELECT id FROM dataset WHERE name=%s', name):
            logger.warning('ds_name already exists: {}. Deleting'.format(name))
            self.db.alter('DELETE FROM dataset WHERE id=%s', r[0])

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
        coord_path = self.wd_manager.coord_path

        self.coords = self.sc.textFile(coord_path).map(self._parse_coord_row).filter(lambda t: len(t) == 2).collect()
        self.min_x, self.min_y = np.amin(np.asarray(self.coords), axis=0)
        self.max_x, self.max_y = np.amax(np.asarray(self.coords), axis=0)

        _coord = np.array(self.coords)
        _coord = np.around(_coord, 5)  # correct for numerical precision
        _coord -= np.amin(_coord, axis=0)

        nrows, ncols = self.get_dims()
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

    def get_sample_area_mask(self):
        """
        Returns
        -------
        : ndarray
            One-dimensional bool array of pixel indices where spectra were sampled
        """
        nrows, ncols = self.get_dims()
        sample_area_mask = np.zeros(ncols * nrows).astype(bool)
        sample_area_mask[self.norm_img_pixel_inds] = True
        return sample_area_mask

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
    def txt_to_spectrum_non_cum(s):
        arr = s.strip().split("|")
        return int(arr[0]), np.fromstring(arr[1], sep=' ').astype('float32'), np.fromstring(arr[2], sep=' ')

    def get_spectra(self):
        """
        Returns
        -------
        : pyspark.rdd.RDD
            Spark RDD with spectra. One spectrum per RDD entry.
        """
        txt_to_spectrum = self.txt_to_spectrum_non_cum
        logger.info('Converting txt to spectrum rdd from %s', self.wd_manager.txt_path)
        return self.sc.textFile(self.wd_manager.txt_path,minPartitions=8).map(txt_to_spectrum)

    def _update_ds_meta(self):
        """ Save dataset metadata (name, path, image bounds, coordinates) to the database """
        ds_r = self.db.select('SELECT id FROM dataset WHERE id=%s', self.id)

        if not ds_r:
            img_bounds = json.dumps({'x': {'min': self.min_x, 'max': self.max_x},
                                     'y': {'min': self.min_y, 'max': self.max_y}})

            ds_row = [(self.id, self.name, self.input_path,
                       json.dumps(self.metadata), img_bounds, json.dumps(self.ds_config))]
            self.db.insert(DS_INSERT, ds_row)

            logger.info("Inserted into the dataset table: %s, %s", self.id, self.name)

            xs, ys = map(list, zip(*self.coords))
            self.db.insert(COORD_INSERT, [(self.id, xs, ys)])
            logger.info("Inserted to the coordinates table")
