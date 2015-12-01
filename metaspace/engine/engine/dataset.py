"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
from codecs import open


def txt_to_spectrum(s):
    """Converts a text string in the format to a spectrum in the form of two arrays:
    array of m/z values and array of partial sums of intensities.

    :param s: string id|mz1 mz2 ... mzN|int1 int2 ... intN
    :returns: triple spectrum_id, mzs, cumulative sum of intensities
    """
    arr = s.strip().split("|")
    intensities = np.fromstring("0 " + arr[2], sep=' ')
    return int(arr[0]), np.fromstring(arr[1], sep=' '), np.cumsum(intensities)


class Dataset(object):

    def __init__(self, sc, ds_path, ds_coord_path, sm_config):
        self.sc = sc
        self.ds_path = ds_path
        self.ds_coord_path = ds_coord_path
        self.sm_config = sm_config

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
        # this function maps coords onto pixel indicies (assuming a grid defined by bounding box and transform type)
        # -implement methods such as interp onto grid spaced over coords
        # -currently treats coords as grid positions,
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
        return self.norm_img_pixel_inds

    def get_dims(self):
        return (self.max_y - self.min_y + 1,
                self.max_x - self.min_x + 1)

    def get_spectra(self):
        if self.sm_config['fs']['local']:
            return self.sc.textFile('file:///' + self.ds_path).map(txt_to_spectrum)
        else:
            return self.sc.textFile('hdfs://localhost:9000' + self.ds_path).map(txt_to_spectrum)
