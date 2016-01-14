"""
Created on 27.08.2015

@author: Dominik Fay
"""
import unittest

import numpy
from numpy.ma.testutils import assert_array_equal

from .. import mass_spectrum


class MassSpectrumTest(unittest.TestCase):
    def test_init(self):
        """Check that spectrum is empty on initialization."""
        ms = mass_spectrum.MassSpectrum()
        mzs, ints = ms.get_spectrum()
        assert_array_equal([], mzs)
        assert_array_equal([], ints)

    def test_copy_if_empty(self):
        """Check that get_spectrum creates a new numpy array if the spectrum has not been set."""
        ms = mass_spectrum.MassSpectrum()
        mzs1, ints1 = ms.get_spectrum()
        mzs2, ints2 = ms.get_spectrum()

        self.assertFalse(mzs1 is mzs2)
        self.assertFalse(ints1 is ints2)

    def test_copy_if_list(self):
        """Check that get_spectrum creates a new numpy array if the spectrum has been set as list."""
        ms = mass_spectrum.MassSpectrum()

        mzs_list = [1, 2, 3]
        ints_list = [2, 4, 6]
        ms.add_spectrum(mzs_list, ints_list)
        mzs_array, ints_array = ms.get_spectrum()

        self.assertFalse(mzs_list is mzs_array)
        self.assertFalse(ints_list is ints_array)

    def test_no_copy_if_array(self):
        """Check that get_spectrum does not create a new numpy array if the spectrum has been set as array."""
        ms = mass_spectrum.MassSpectrum()

        mzs_array1 = numpy.array([1, 2, 3])
        ints_array1 = numpy.array([2, 4, 6])
        ms.add_spectrum(mzs_array1, ints_array1)
        mzs_array2, ints_array2 = ms.get_spectrum()

        self.assertTrue(mzs_array1 is mzs_array2)
        self.assertTrue(ints_array1 is ints_array2)

    def test_use_centroid_if_given(self):
        """Check that get_spectrum returns the centroids if they have been set."""
        ms = mass_spectrum.MassSpectrum()

        mzs_profile1 = numpy.array([1, 2, 3])
        ints_profile1 = numpy.array([2, 6, 4])
        mzs_centroid1 = numpy.array([2.2])
        ints_centroid1 = numpy.array([12])
        ms.add_spectrum(mzs_profile1, ints_profile1)
        ms.add_centroids(mzs_centroid1, ints_centroid1)
        mzs_profile2, ints_profile2 = ms.get_spectrum(source='profile')
        mzs_centroid2, ints_centroid2 = ms.get_spectrum(source='centroids')

        self.assertTrue(mzs_profile1 is mzs_profile2)
        self.assertTrue(ints_profile1 is ints_profile2)
        self.assertTrue(mzs_centroid1 is mzs_centroid2)
        self.assertTrue(ints_centroid1 is ints_centroid2)

    def test_IOError_if_unknown_kwarg(self):
        """Check that get_spectrum raises an IOError when an unknown value of the kwarg 'source' is passed."""
        ms = mass_spectrum.MassSpectrum()
        self.assertRaises(IOError, ms.get_spectrum, source='asdf')

    def test_IOError_if_different_arr_sizes(self):
        """Check that add_spectrum and add_centroids raise an IOError when the size of the m/z array and the
        intensity array differ.
        """
        ms = mass_spectrum.MassSpectrum()
        test_cases = (
            ([], [1]), ([-7.4], []), ([2968.2395, 29305.23, -23698.5, 1, 2 ** 28], range(2)),
            (range(198), range(102958)))

        for case in test_cases:
            self.assertRaises(IOError, ms.add_spectrum, *case)
            self.assertRaises(IOError, ms.add_centroids, *case)


if __name__ == "__main__":
    unittest.main()
