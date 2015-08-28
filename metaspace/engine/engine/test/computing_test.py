__author__ = 'intsco'

import unittest
from unittest import TestCase
from engine.computing import avg_intensity_correlation, avg_img_correlation, txt_to_spectrum
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


class AvgIntensityCorrelation(TestCase):

    def setUp(self):
        pass

    def test_abs_corr(self):
        images = [{1: 100, 2: 100, 3: 100},
                  {1: 10, 2: 10, 3: 10},
                  {1: 1, 2: 1, 3: 1},
                  {1: 0, 2: 0, 3: 0}]
        peak_ints = [100, 10, 1, 0]

        self.assertAlmostEqual(avg_intensity_correlation(images, peak_ints), 1.0)

    def test_zero_var_corr(self):
        images = [{1: 100, 2: 100, 3: 100},
                  {1: 10, 2: 10, 3: 10},
                  {1: 1, 2: 1, 3: 1},
                  {1: 0, 2: 0, 3: 0}]
        peak_ints = [1, 1, 1, 1]

        self.assertAlmostEqual(avg_intensity_correlation(images, peak_ints), 0)

        images = [{1: 1, 2: 1},
                  {1: 1, 2: 1},
                  {1: 1, 2: 1},
                  {1: 1, 2: 1}]
        peak_ints = [1, 2, 3, 4]

        self.assertAlmostEqual(avg_intensity_correlation(images, peak_ints), 0)

    def test_near_zero_corr(self):
        m, n = 100, 4
        random.seed(42)
        images = [{i: random.rand() for i in range(m)}
                  for i in range(n)]
        random.seed(321)
        peak_ints = [random.rand() for i in range(n)]

        self.assertLess(avg_intensity_correlation(images, peak_ints), 0.1)


class AvgImgCorrelation(TestCase):

    def test_abs_corr(self):
        images = [{1: 10, 2: 20, 3: 30},
                  {1: 10, 2: 20, 3: 30},
                  {1: 10, 2: 20, 3: 30}]

        self.assertAlmostEqual(avg_img_correlation(images), 1)

    def test_zero_var_corr(self):
        images = [{1: 10, 2: 20, 3: 30},
                  {1: 1, 2: 1, 3: 1},
                  {1: 2, 2: 2, 3: 2}]

        self.assertAlmostEqual(avg_img_correlation(images), 0)

    def test_near_zero_corr(self):
        n, m = 4, 100
        seeds = [13, 32, 35, 100]
        images = []
        for i in range(n):
            random.seed(seeds[i])
            images.append({j: random.rand() for j in range(m)})

        self.assertLess(avg_img_correlation(images), 0.1)


if __name__ == '__main__':
    unittest.main()
