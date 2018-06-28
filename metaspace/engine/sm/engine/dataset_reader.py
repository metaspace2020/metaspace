import json
import numpy as np
import logging

from sm.engine.ms_txt_converter import MsTxtConverter
from sm.engine.util import SMConfig, read_json
from sm.engine.db import DB
from sm.engine.es_export import ESExporter


logger = logging.getLogger('engine')


class DatasetReader(object):
    """ Class for reading dataset coordinates and spectra

    Args
    ----------
    input_path : str
        Input path with mass spec files
    sc : pyspark.SparkContext
        Spark context object
    """
    def __init__(self, input_path, sc, wd_manager):
        self.input_path = input_path

        self._wd_manager = wd_manager
        self._sc = sc

        self.coord_pairs = None

    @staticmethod
    def _parse_coord_row(s):
        res = []
        row = s.strip('\n')
        if len(row) > 0:
            vals = row.split(',')
            if len(vals) > 0:
                res = [int(v) for v in vals[1:]]
        return res

    @staticmethod
    def _is_valid_coord_row(fields):
        return len(fields) == 2

    def _determine_pixel_order(self):
        coord_path = self._wd_manager.coord_path

        self.coord_pairs = (self._sc.textFile(coord_path)
                            .map(self._parse_coord_row)
                            .filter(self._is_valid_coord_row).collect())
        self.min_x, self.min_y = np.amin(np.asarray(self.coord_pairs), axis=0)
        self.max_x, self.max_y = np.amax(np.asarray(self.coord_pairs), axis=0)

        _coord = np.array(self.coord_pairs)
        _coord = np.around(_coord, 5)  # correct for numerical precision
        _coord -= np.amin(_coord, axis=0)

        nrows, ncols = self.get_dims()
        pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
        pixel_indices = pixel_indices.astype(np.int32)
        self._norm_img_pixel_inds = pixel_indices

    def get_norm_img_pixel_inds(self):
        """
        Returns
        -------
        : ndarray
            One-dimensional array of indexes for dataset pixels taken in row-wise manner
        """
        return self._norm_img_pixel_inds

    def get_sample_area_mask(self):
        """
        Returns
        -------
        : ndarray
            One-dimensional bool array of pixel indices where spectra were sampled
        """
        nrows, ncols = self.get_dims()
        sample_area_mask = np.zeros(ncols * nrows).astype(bool)
        sample_area_mask[self._norm_img_pixel_inds] = True
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

    def get_2d_sample_area_mask(self):
        return self.get_sample_area_mask().reshape(self.get_dims())

    def copy_convert_input_data(self):
        if not self._wd_manager.exists(self._wd_manager.txt_path):
            self._wd_manager.copy_input_data(self.input_path)
            ms_converter = MsTxtConverter(self._wd_manager.local_dir.ms_file_path,
                                          self._wd_manager.local_dir.txt_path,
                                          self._wd_manager.local_dir.coord_path)
            ms_converter.convert()

            if not self._wd_manager.local_fs_only:
                self._wd_manager.upload_to_remote()

        self._determine_pixel_order()

    @staticmethod
    def txt_to_spectrum_non_cum(s):
        arr = s.strip().split(b'|')
        return int(arr[0]), np.fromstring(arr[1], sep=' ').astype('float32'), np.fromstring(arr[2], sep=' ')

    def get_spectra(self):
        """
        Returns
        -------
        : pyspark.rdd.RDD
            Spark RDD with spectra. One spectrum as a triple (int, np.ndarray, np.ndarray) per RDD entry.
        """
        txt_to_spectrum = self.txt_to_spectrum_non_cum
        logger.info('Converting txt to spectrum rdd from %s', self._wd_manager.txt_path)
        return self._sc.textFile(self._wd_manager.txt_path, minPartitions=16, use_unicode=False).map(txt_to_spectrum)
