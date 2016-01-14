import itertools
import unittest

import numpy

import common
from ..centroid_detection import gradient

__author__ = 'Dominik Fay'


class CentroidDetectionTest(common.MSTestCase):
    def test_gradient_kwarg_validity(self):
        """Check that gradient raises a NameError when called with unknown kwargs."""
        passing_test_cases = (
            {},
            {'max_output': -1},
            {'weighted_bins': 1, 'min_intensity': 0},
            {'max_output': 7, 'weighted_bins': 2, 'min_intensity': 28}
        )
        failing_test_cases = (
            {'foo': 'bar'},
            {'max_output': -1, 'weighted_bins': 1, 'min_intensity': 0, 'foo': 42}
        )

        for passing_spectrum in self.to_array_tuples(self.valid_spectrum_data):
            for passing_kwarg in passing_test_cases:
                try:
                    gradient(*passing_spectrum, **passing_kwarg)
                except Exception as e:
                    print("Exception when calling gradient with\nargs %s and\nkwargs %s" % (
                        passing_spectrum, passing_kwarg))
                    raise
            for failing_kwarg in failing_test_cases:
                self.assertRaises(NameError, gradient, *passing_spectrum, **failing_kwarg)

    def test_gradient_kwarg_permutations(self):
        """Check postconditions for various kwargs."""
        thresholds = [0, 5, 100, 10 ** 10]
        max_outputs = [-1, 10 ** 11, 10 ** 3, 20, 5, 1]

        for mzs, ints in self.to_array_tuples(self.valid_spectrum_data):
            for th, max_out in itertools.product(thresholds, max_outputs):
                kwargs = {'min_intensity': th, 'max_output': max_out}
                res_mzs, res_ints, res_idxs = gradient(mzs, ints, **kwargs)
                self.check_postconditions(mzs, ints, kwargs, res_mzs, res_ints, res_idxs)

    def check_postconditions(self, mzs_in, ints_in, kwargs, mzs_out, ints_out, idx_list_out):
        th = kwargs.get('min_intensity', 0)
        max_out = kwargs.get('max_output', -1)
        # same length for returned lists
        self.assertEqual(len(mzs_out), len(ints_out))
        self.assertEqual(len(mzs_out), len(idx_list_out))
        # shorter or as long as input
        self.assertLessEqual(len(mzs_out), len(mzs_in))
        # length equal or less than max_out
        if max_out >= 0:
            self.assertLessEqual(len(mzs_out), max_out)
        if len(ints_out) != 0:
            # print "%s -> %s" % (ints_in, ints_out)
            # above threshold
            self.assertGreaterEqual(min(ints_out), th)
            # max is less than or equal to input max
            self.assertLessEqual(max(ints_out), max(ints_in))
        elif max_out != 0:
            # check that there was really no intensity higher than th
            self.assertLess(max(ints_in), th, msg="Empty results although th<=max(intensites). Input: mz=%s, int=%s, "
                                                  "th=%s" % (mzs_in, ints_in, th))
        # mzs and idx_list are still sorted
        numpy.testing.assert_array_equal(mzs_out, sorted(mzs_out))
        numpy.testing.assert_array_equal(idx_list_out, sorted(idx_list_out))


if __name__ == "__main__":
    unittest.main()
