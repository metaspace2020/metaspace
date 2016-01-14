from unittest import TestCase

import numpy as np

from image_measures import isotope_pattern_match, isotope_image_correlation


class IsotopePatternMatchTest(TestCase):
    def test_empty_inputs(self):
        inputs = (
            ([], []),
            ([[]], [0.3]),
            ([[]] * 2, [0.2] * 2),
        )
        for args in inputs:
            self.assertRaises(Exception, isotope_pattern_match, *args)

    def test_misaligned_shapes(self):
        inputs = (
            (np.arange(5 * 5).reshape((5, 5)), np.arange(6)),
            (np.ones(5), np.ones(5)),
            (np.ones((3, 3)), []),
            ([[]], []),
            (np.arange(2 * 2 * 2).reshape((2, 2, 2)), [0.2] * 2),
            ([[], [1]], [1, 1]),
        )
        for args in inputs:
            self.assertRaises(Exception, isotope_pattern_match, *args)

    def test_negative_intensities(self):
        inputs = (
            (np.ones((5, 5)), np.linspace(-0.1, 0.9, num=5)),
            (np.ones((1, 1)), -np.ones(1)),
        )
        for args in inputs:
            self.assertRaises(ValueError, isotope_pattern_match, *args)

    def test_trivial(self):
        test_cases = (
            # 1 - (1 - 1) == 1, caught as special case => return 0
            (np.ones((1, 1)), np.ones(1), 0),
            # 1 - abs(0.5 - 1) == 0.5
            (np.ones((4, 1)), np.array([4, 0, 0, 0]), 0.5),
            # order does not matter if images are equal
            (np.ones((4, 1)), np.array([0, 0, 4, 0]), 0.5),
            # same with bigger but lower-intensity images (only sum is considered)
            (np.ones((4, 10000)) / 10000., np.array([0, 0, 4, 0]), 0.5),
            # sum(np.linspace(0, 0.02, num=100)) == 1
            ([np.linspace(0, 0.02, num=100)] * 4, np.array([0, 0, 4, 0]), 0.5),
            # still the same, but with additional noise (<= 0 pixels are ignored)
            ([np.arange(-2, 2)] * 4, np.array([4, 0, 0, 0]), 0.5),
        )
        for im_in, ints_in, expected in test_cases:
            # should for for both lists and arrays equally
            arr_im_in = np.array(im_in)
            list_im_in = list(im_in)
            self.assertAlmostEqual(isotope_pattern_match(arr_im_in, ints_in), expected, delta=1e-8)
            self.assertAlmostEqual(isotope_pattern_match(list_im_in, ints_in), expected, delta=1e-8)


class TestIsotopeImageCorrelation(TestCase):
    def test_returns_zero_for_small_inputs(self):
        inputs = (
            ([],),
            ([], np.arange(10)),
            ([np.arange(10)],),
            ([np.arange(10)], np.arange(10)),
        )
        for input_ in inputs:
            self.assertEqual(isotope_image_correlation(*input_), 0)

    def test_weights_defaults_to_ones(self):
        np.random.seed(0)
        inputs = np.random.random((10, 5, 100))
        for im in inputs:
            self.assertEqual(isotope_image_correlation(im), isotope_image_correlation(im, weights=np.ones(4)))

    def test_raises_if_images_are_not_1d(self):
        inputs = (
            [1, 2, 3],  # 0d
            np.arange(5 * 5 * 5).reshape((5, 5, 5)),  # 2d
        )
        for input_ in inputs:
            self.assertRaises(TypeError, isotope_image_correlation, input_)

    def test_raises_on_misaligned_image_shapes(self):
        inputs = (
            [[], [1]],
            [np.arange(100), np.arange(100), np.arange(100), np.arange(99)]
        )
        for input_ in inputs:
            self.assertRaises(Exception, isotope_image_correlation, input_)

    def test_raises_on_wrong_number_of_weights(self):
        inputs = (
            (np.arange(5 * 25).reshape(5, 25), np.ones(5)),
            (np.arange(5 * 25).reshape(5, 25), []),
        )
        for input_ in inputs:
            self.assertRaises(ValueError, isotope_image_correlation, *input_)

    def test_trivial_cases(self):
        test_cases = (
            ({'images_flat': [np.linspace(0, 1, 100), np.linspace(0, 1, 100)]}, 1),
            ({'images_flat': [np.linspace(0, 5, 10), np.linspace(0, 1, 10), np.linspace(0, 0.01, 10)],
              'weights': [5, 0.1]}, 1),
            ({'images_flat': [np.linspace(0, 1, 100000), np.linspace(0, 1, 100000) ** 2,
                              np.linspace(0, 1, 100000) ** 3]}, 0.942379675),
            ({'images_flat': [np.linspace(0, 1, 100000), np.linspace(0, 1, 100000) ** 2,
                              np.linspace(0, 1, 100000) ** 3], 'weights': [2, 1]}, 0.9510015266666666)
        )
        for input_, expected in test_cases:
            self.assertAlmostEqual(isotope_image_correlation(**input_), expected)
