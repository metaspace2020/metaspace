__author__ = 'intsco'
"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""

import numpy as np


class Dataset(object):

    def __init__(self, sc, ds_path, ds_coord_path):
        self.sc = sc
        self.ds_path = ds_path
        self.ds_coord_path = ds_coord_path

        self.max_x, self.max_y = None, None

        self._define_pixels_order()

    def _define_pixels_order(self):
        # this function maps coords onto pixel indicies (assuming a grid defined by bounding box and transform type)
        # -implement methods such as interp onto grid spaced over coords
        # -currently treats coords as grid positions,

        with open(self.ds_coord_path) as f:
            coords = map(lambda s: map(int, s.strip('\n').split(',')[1:]), f.readlines())
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

    def get_data(self):
        return self.sc.textFile(self.ds_path)
