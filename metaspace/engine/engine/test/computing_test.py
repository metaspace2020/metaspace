__author__ = 'intsco'

import unittest
from unittest import TestCase
from engine.computing import iso_pattern_match, iso_img_correlation, txt_to_spectrum
import numpy as np
from numpy import random
from numpy.testing import assert_array_almost_equal


class TxtToSpectrumTest(TestCase):

    def test_arrays_order(self):
        s = '0|1.1 1.2 1.3|2.0 2.0 2.0'
        sp_id, mzs, ints = txt_to_spectrum(s)
        self.assertEqual(sp_id, '0')
        assert_array_almost_equal(mzs, np.array([1.1, 1.2, 1.3]))
        assert_array_almost_equal(ints, np.array([2.0, 2.0, 2.0]))


class IsoPatternMatchTest(TestCase):

    def test_abs_match(self):
        images = [{1: 100}, {1: 10}, {1: 1}, {1: 0}]
        theor_ints = [100, 10, 1, 0]

        self.assertAlmostEqual(iso_pattern_match(images, theor_ints), 1.0)


class AvgImgCorrelation(TestCase):

    def test_abs_corr(self):
        images = [{1: 10, 2: 20, 3: 30},
                  {1: 10, 2: 20, 3: 30},
                  {1: 10, 2: 20, 3: 30}]

        self.assertAlmostEqual(iso_img_correlation(images), 1)


if __name__ == '__main__':
    unittest.main()
