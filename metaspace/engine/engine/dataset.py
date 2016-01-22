import numpy as np
from codecs import open

from engine.util import local_path, hdfs_path, logger, SMConfig


class Dataset(object):
    """ A class representing a mass spectrometry dataset. Backed by a couple of plain text files containing
    coordinates and spectra.

    Args
    ----------
    sc : pyspark.SparkContext
        Spark context object
    ds_path : String
        Path to a plain text file with spectra
    ds_coord_path : String
        Path to a plain text file with coordinates
    """
    def __init__(self, sc, ds_path, ds_coord_path):
        self.sc = sc
        self.ds_path = ds_path
        self.ds_coord_path = ds_coord_path
        self.sm_config = SMConfig.get_conf()

        self.max_x, self.max_y = None, None

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
        with open(self.ds_coord_path) as f:
            coords = filter(lambda t: len(t) == 2, map(self._parse_coord_row, f.readlines()))
        _coord = np.asarray(coords)
        _coord = np.around(_coord, 5)  # correct for numerical precision
        _coord -= np.amin(_coord, axis=0)

        self.min_x, self.min_y = np.amin(_coord, axis=0)
        self.max_x, self.max_y = np.amax(_coord, axis=0)

        pixel_indices = _coord[:, 1] * (self.max_x+1) + _coord[:, 0]
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
            logger.info('Converting txt to spectrum rdd from %s', local_path(self.ds_path))
            return self.sc.textFile(local_path(self.ds_path)).map(txt_to_spectrum)
        else:
            logger.info('Converting txt to spectrum rdd from %s', hdfs_path(self.ds_path))
            return self.sc.textFile(hdfs_path(self.ds_path), minPartitions=8).map(txt_to_spectrum)
