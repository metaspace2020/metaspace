import unittest

import numpy as np

from ..imutils import nan_to_zero, quantile_threshold, interpolate


class ImutilsTest(unittest.TestCase):
    def test_nan_to_zero_with_ge_zero(self):
        ids = (
            np.zeros(1),
            np.ones(range(1, 10)),
            np.arange(1024 * 1024)
        )
        for id_ in ids:
            before = id_.copy()
            notnull = nan_to_zero(id_)
            np.testing.assert_array_equal(before, id_)
            np.testing.assert_array_equal(notnull, before != 0)

    def test_nan_to_zero_with_negatives(self):
        negs = (
            np.array([-1]),
            np.array([np.nan]),
            - np.arange(1, 1024 * 1024 + 1).reshape((1024, 1024)),
            np.linspace(0, -20, 201)
        )
        for neg in negs:
            sh = neg.shape
            expected_notnull = np.zeros(sh).astype(np.bool_)
            actual_notnull = nan_to_zero(neg)
            np.testing.assert_array_equal(neg, np.zeros(sh))
            np.testing.assert_array_equal(actual_notnull, expected_notnull)

    def test_nan_to_zero_with_mixed(self):
        test_cases = (
            (np.array([-1, np.nan, 1e6, -1e6]), np.array([0, 0, 1e6, 0])),
            (np.arange(-2, 7).reshape((3, 3)), np.array([[0, 0, 0], np.arange(1, 4), np.arange(4, 7)])),
        )
        for input_, expected in test_cases:
            nan_to_zero(input_)
            np.testing.assert_array_equal(input_, expected)

    def test_nan_to_zero_with_empty(self):
        in_ = None
        self.assertRaises(AttributeError, nan_to_zero, in_)
        self.assertIs(in_, None)

        in_ = []
        self.assertRaises(TypeError, nan_to_zero, in_)
        self.assertEqual(in_, [])

        in_ = np.array([])
        notnull = nan_to_zero(in_)
        self.assertSequenceEqual(in_, [])
        self.assertSequenceEqual(notnull, [])

    def test_quantile_threshold_ValueError(self):
        test_cases = (
            (np.arange(0), np.arange(0, dtype=np.bool_), -37),
            (np.arange(0), np.arange(0, dtype=np.bool_), -4.4),
            (np.arange(0), np.arange(0, dtype=np.bool_), 101)
        )
        kws = ('im', 'notnull_mask', 'q_val',)
        for args in test_cases:
            kwargs = {kw: val for kw, val in zip(kws, args)}
            self.assertRaises(ValueError, quantile_threshold, **kwargs)

    def test_quantile_threshold_trivial(self):
        test_cases = (
            ((np.arange(10), np.ones(10, dtype=np.bool_), 100), (np.arange(10), 9)),
            (
                (np.arange(101, dtype=np.float32), np.ones(101, dtype=np.bool_), 100. / 3),
                (np.concatenate((np.arange(34), np.repeat(100. / 3, 67))), 100. / 3),
            ),
            (
                (np.arange(20), np.repeat([True, False], 10), 100),
                (np.concatenate((np.arange(10), np.repeat(9, 10))), 9)
            ),
        )
        kws = ('im', 'notnull_mask', 'q_val',)
        for args, expected in test_cases:
            kwargs = {kw: val for kw, val in zip(kws, args)}
            im_in = args[0]
            im_expected, q_expected = expected
            q_actual = quantile_threshold(**kwargs)
            self.assertAlmostEqual(q_expected, q_actual, delta=1e-7)
            np.testing.assert_array_almost_equal(im_in, im_expected, decimal=6)

    def test_interpolate(self):
        im_in = np.arange(900, dtype=np.float32).reshape((30, 30))
        im_in[2, 3] = np.nan
        notnull = im_in > 0

        im_out = interpolate(im_in, notnull)

        np.testing.assert_array_almost_equal(im_in[notnull], im_out[notnull])
        self.assertAlmostEqual(im_out[0, 0], 0)
        self.assertAlmostEqual(im_out[2, 3], 63)


if __name__ == '__main__':
    unittest.main()
