import itertools
import unittest

import numpy
import scipy.stats

from common import load_json_file, SimpleMock, resolve_test_resource
from ..pyisocalc.pyisocalc import *

__author__ = 'dominik'

element_stubs = {
    'O': SimpleMock({
        'name': lambda: 'O',
        'charge': lambda: -2,
        'number': lambda: 8,
        'masses': lambda: [15.99491462, 16.9991315, 17.9991604],
        'mass_ratios': lambda: [0.99757, 0.00038, 0.00205],
        'average_mass': lambda: 15.9994049262634
    }),
    'H': SimpleMock({
        'name': lambda: 'H',
        'charge': lambda: 1,
        'number': lambda: 1,
        'masses': lambda: [1.007825032, 2.014101778],
        'mass_ratios': lambda: [0.999885, 0.000115],
        'average_mass': lambda: 1.00794075382579
    }),
    'Fe': SimpleMock({
        'name': lambda: 'Fe',
        'charge': lambda: 3,
        'number': lambda: 26,
        'masses': lambda: [53.9396147, 55.9349418, 56.9353983, 57.9332801],
        'mass_ratios': lambda: [0.05845, 0.91754, 0.02119, 0.00282],
        'average_mass': lambda: 55.845149918245994
    })
}

sf_stubs = {
    'H2O': SimpleMock({
        'get_segments': lambda: [SegmentStub(element_stubs['H'], 2), SegmentStub(element_stubs['O'], 1)],
        'charge': lambda: 0
    }),
    'H': SimpleMock({
        'get_segments': lambda: [SegmentStub(element_stubs['H'], 1)],
        'charge': lambda: 1
    }),
    'Fe100H89O10': SimpleMock({
        'get_segments': lambda: [SegmentStub(element_stubs['Fe'], 100), SegmentStub(element_stubs['H'], 89),
                                 SegmentStub(element_stubs['O'], 10)],
        'charge': lambda: 369
    })
}

chemcalc_ref_values = {}
for sf_str in sf_stubs:
    fn = resolve_test_resource("pyisocalc", "perfect_pattern", sf_str)
    res_dict = load_json_file(fn)
    chemcalc_ref_values[sf_str] = res_dict


class ElementTest(unittest.TestCase):
    def test_init(self):
        valid_args = ('H', 'Ar', 1, 49)
        valueerror_args = ('', 'foo', -45, 2345)
        typeerror_args = (1.0, None)
        for arg in valid_args:
            Element(arg)
        for arg in valueerror_args:
            self.assertRaises(ValueError, Element, arg)
        for arg in typeerror_args:
            self.assertRaises(TypeError, Element, arg)

    def test_probability_distribution(self):
        for s in periodic_table:
            e = Element(s)
            masses = e.masses()
            probs = e.mass_ratios()
            self.assertEquals(masses, sorted(masses))
            self.assertAlmostEqual(1.0, sum(probs), delta=0.001)
            self.assertEqual(len(masses), len(probs))


class FormulaSegmentTest(unittest.TestCase):
    def test_fields_accessible(self):
        s = FormulaSegment('H', 1)
        self.assertEqual(s.element(), 'H')
        self.assertEqual(s.amount(), 1)

    def test_raise_on_invalid_number(self):
        invalid_integers = [0, -1]
        for n in invalid_integers:
            self.assertRaises(ValueError, FormulaSegment, 'H', n)
        non_integers = [45.2, 'foo']
        for n in non_integers:
            self.assertRaises(TypeError, FormulaSegment, 'H', n)


class SumFormulaTest(unittest.TestCase):
    def test_segments_are_tuple(self):
        segments = [1, 2, 3]
        sf = SumFormula(segments)
        self.assertIsInstance(sf.get_segments(), tuple)
        self.assertSequenceEqual(segments, sf.get_segments())


class SumFormulaParserTest(unittest.TestCase):
    def test_expand_raises_on_malformed_string(self):
        syntactically_invalid_strings = ['()=', 'h2o', '']
        semantically_invalid_strings = ['ABC', 'FoO', 'Hh20']
        for s in syntactically_invalid_strings:
            self.assertRaises(ValueError, SumFormulaParser.expand, s)
        for s in semantically_invalid_strings:
            self.assertRaises(ValueError, SumFormulaParser.expand, s)

    def test_make_segments_raises_on_nonexpanded_string(self):
        syntactically_invalid_strings = ['()=', 'H((H20)3', 'h2o', '',
                                         'H(NO2)3', 'H-3', 'H0' 'H4.2']
        semantically_invalid_strings = ['ABC', 'FoO', 'Hh20']
        for s in syntactically_invalid_strings:
            self.assertRaises(ValueError, SumFormulaParser.expand, s)
        for s in semantically_invalid_strings:
            self.assertRaises(ValueError, SumFormulaParser.expand, s)

    def test_expand(self):
        test_cases = (
            ('H(NO2)3', 'HN3O6'),
            ('(N)5', 'N5'),
            ('(((H)2)3)4', 'H24'),
            ('H2O', 'H2O'),
            ('Cl(Cl2)3', 'ClCl6')
        )
        for i, o in test_cases:
            self.assertEqual(o, SumFormulaParser.expand(i))

    def test_make_segments(self):
        test_cases = (
            ('H', [FormulaSegment(Element('H'), 1)]),
            ('H2O', [FormulaSegment(Element('H'), 2), FormulaSegment(Element('O'), 1)])
        )
        for i, o in test_cases:
            self.assertSequenceEqual(o, list(SumFormulaParser.iter_segments(i)))


class SingleElementPatternTest(unittest.TestCase):
    def setUp(self):
        self.tol = 1e-23
        self.Fe78_res_dict = load_json_file(resolve_test_resource("pyisocalc", "single_pattern", "Fe78"))

    def test_single_element_pattern(self):
        segments = (
            SegmentStub(element_stubs['H'], 1),
            SegmentStub(element_stubs['O'], 9),
            SegmentStub(element_stubs['Fe'], 78),
        )
        thresholds = (0, 1e-9, 1e-27, 1, 1e27)
        for s, th in itertools.product(segments, thresholds):
            ms = single_pattern_fft(s, th)
            mzs, ints = ms.get_spectrum()
            self.assertAlmostEqual(sum(ints), 1. if th < 1 else 0, delta=1e-3)
            np.testing.assert_array_less(np.repeat(th - self.tol, len(ints)), ints)
            self.assertEqual(len(mzs), len(ints))
            np.testing.assert_array_less(np.repeat(0, len(mzs)), mzs)

    def test_Fe78(self):
        th = 0
        seg_in = SegmentStub(element_stubs['Fe'], 78)
        expected_mzs, expected_ints = np.array(self.Fe78_res_dict["mzs"]), np.array(self.Fe78_res_dict["ints"])
        actual_mzs, actual_ints = single_pattern_fft(seg_in, threshold=th).get_spectrum()
        self.assertAlmostEqual(sum(actual_ints), 1., delta=1e-3)

        n = min(10, len(actual_mzs), len(expected_mzs))
        top10_expected_mzs, top10_expected_ints = pick_top_n(expected_mzs, expected_ints, n)
        top10_actual_mzs, top10_actual_ints = pick_top_n(actual_mzs, actual_ints, n)
        top10_actual_ints *= 100. / max(top10_actual_ints)

        np.testing.assert_array_almost_equal(top10_expected_mzs, top10_actual_mzs, decimal=3)
        np.testing.assert_array_almost_equal(top10_expected_ints, top10_actual_ints, decimal=3)

    def test_raise_on_invalid_threshold(self):
        self.assertRaises(ValueError, single_pattern_fft, None, -1)


class TrimTest(unittest.TestCase):
    def test_trim(self):
        test_cases = (
            (([1], [1]), ([1.], [1.])),
            ((range(1000), [1] * 1000), ([499500.], [1.])),
            (([1, 2, 3, 4, 5, 6], [1, 2, 3, 3, 4, 5]), ([1., 2., 7., 5., 6.], [1., 2., 3., 4., 5.]))
        )
        for (i_y, i_x), (expected_y, expected_x) in test_cases:
            actual_y, actual_x = trim(i_y, i_x)
            numpy.testing.assert_array_equal(expected_x, actual_x)
            numpy.testing.assert_array_equal(expected_y, actual_y)


class PerfectPatternTest(unittest.TestCase):
    def test_top_n_peaks(self):
        for sf_str in sf_stubs:
            sf_stub = sf_stubs[sf_str]
            reference_values = chemcalc_ref_values[sf_str]

            actual_masses, actual_ratios = perfect_pattern(sf_stub, cutoff_perc=0.00001, charge=0).get_spectrum(
                source="centroids")
            expected_masses, expected_ratios = numpy.asarray(reference_values['mzs']), np.asarray(reference_values[
                                                                                                      'ints'])
            top10actual_masses, top10actual_ratios = pick_top_n(actual_masses, actual_ratios, n=10)
            top10expected_masses, top10expected_ratios = pick_top_n(expected_masses, expected_ratios, n=10)

            np.testing.assert_array_almost_equal(top10actual_masses, top10expected_masses, decimal=3)
            np.testing.assert_array_almost_equal(top10actual_ratios, top10expected_ratios, decimal=3)

    def test_functions(self):
        pass


class TestTotalPoints(unittest.TestCase):
    def test_valid_inputs(self):
        test_cases = (
            ((1, 11, 2), 21),
            ((492.7, 5178.3, 25), 117141),
            # TODO add real example from ChemCalc
        )
        for (min_x, max_x, points_per_mz), expected_pts in test_cases:
            actual_pts = total_points(min_x, max_x, points_per_mz)
            self.assertEqual(expected_pts, actual_pts)

    def test_raises_valueerror(self):
        invalid_inputs = (
            # min > max
            (5, 4, 1),
            # <= 0 values
            (0, 1, 0),
            (-3, 27, 10),
            (-27, -3, 10),
            (3, 27, -10)
        )
        for mi, ma, fwhm in invalid_inputs:
            self.assertRaises(ValueError, fwhm_to_sigma, mi, ma, fwhm)


class TestFwhmToSigma(unittest.TestCase):
    def test_valid_inputs(self):
        test_cases = (
            ((1, 11, 1.), 0.42466090014400956),
            ((492.7, 5178.3, 0.001), 0.00042466090014400956),
            # TODO add real example from ChemCalc
        )
        for (min_x, max_x, fwhm), expected_sigma in test_cases:
            actual_sigma = fwhm_to_sigma(min_x, max_x, fwhm)
            self.assertAlmostEqual(expected_sigma, actual_sigma, delta=1e-5)

    def test_raises_valueerror(self):
        invalid_inputs = (
            # min > max
            (5, 4, 1.),
            # <= 0 values
            (-3, 27, 0.01),
            (3, 27, -0.01),
            (-27, -3, 0.01)
        )
        for mi, ma, fwhm in invalid_inputs:
            print mi, ma, fwhm
            self.assertRaises(ValueError, fwhm_to_sigma, mi, ma, fwhm)


class TestGenGaussian(unittest.TestCase):
    def setUp(self):
        self.ms_stub = SimpleMock({'get_spectrum': lambda source: (np.array([1., 2.]), np.array([50., 100.]))})

    def test_raises_errors(self):
        test_cases = (
            ((self.ms_stub, -1, 10), ValueError),
            ((self.ms_stub, 0, 10), ValueError),
            ((self.ms_stub, 10, 0), ValueError),
            ((self.ms_stub, 0, 0), ValueError),
            ((self.ms_stub, -1, 10), ValueError),
            ((self.ms_stub, 1, -3), ValueError),
            ((self.ms_stub, 1, 10.), TypeError),
        )
        for (ms, sigma, pts), e in test_cases:
            self.assertRaises(e, gen_gaussian, ms, sigma, pts)

    def test_valid_inputs(self):
        regular_cases = (
            (self.ms_stub, 1, 2),
            (self.ms_stub, 1, 3000),
            (self.ms_stub, 0.42466, 3000),
            (self.ms_stub, 3e20, int(1e7)),
        )
        chemcalc_results = []
        for d in chemcalc_ref_values.values():
            ms = SimpleMock({'get_spectrum': lambda source: (np.array(d['mzs']), np.array(d['ints']))})
            chemcalc_results.append(ms)
        sigmas = [1e-20, 3e20]
        pts = [1, int(1e6)]
        generated_cases = itertools.product(chemcalc_results, sigmas, pts)
        for ms, sig, pts in itertools.chain(regular_cases, generated_cases):
            input_mzs, input_ints = ms.get_spectrum(source="centroids")
            expected_mzs, expected_ints = combinded_gaussian(input_mzs, input_ints, sig, pts)
            actual_mzs, actual_ints = gen_gaussian(ms, sig, pts)
            np.testing.assert_array_almost_equal(expected_mzs, actual_mzs, decimal=5)
            np.testing.assert_array_almost_equal(expected_ints, actual_ints, decimal=5)


def pick_top_n(mzs, ints, n=10):
    indexes = numpy.argsort(ints)[::-1][:n]
    return mzs[indexes], ints[indexes]


def single_gaussian(x, mu, sig):
    # using trustable scipy implementation
    f = scipy.stats.norm(loc=mu, scale=sig).pdf
    distr = f(x) / f(mu)
    return distr


def combinded_gaussian(mzs, ints, sig, pts):
    # slow alternative to gen_gaussian to create reference values for it
    # creates a gaussian curve for each peak on the whole grid, then sums them up
    grid = np.linspace(min(mzs) - 1, max(mzs) + 1, pts)
    return grid, sum(i * single_gaussian(grid, mu, sig) for mu, i in zip(mzs, ints))


class TestApplyGaussian(unittest.TestCase):
    def test_raises_valueerror(self):
        test_cases = (
            (MassSpectrum(), 0, 0),
            (MassSpectrum(), -1, 10),
            (MassSpectrum(), 2, -0.01),
        )
        for i in test_cases:
            self.assertRaises(ValueError, apply_gaussian, *i)

    def apply_and_assert(self, ms_in, sigma, kwargs, expected):
        actual = apply_gaussian(ms_input=ms_in, sigma=sigma, **kwargs)
        for ex_p, ex_c, ac_p, ac_c in zip(expected.get_spectrum(), expected.get_spectrum(
                'centroids'), actual.get_spectrum(), actual.get_spectrum('centroids')):
            np.testing.assert_array_almost_equal(ac_p, ex_p, decimal=4)
            np.testing.assert_array_almost_equal(ac_c, ex_c, decimal=4)

    # small corner case
    def test_default_params_sigma_0_4246(self):
            self.apply_and_assert(SimpleMock({
                'get_spectrum': lambda source: (np.array([2.]), np.array([100.]))
            }), 0.42466090014400953, {}, SimpleMock({
                'get_spectrum': lambda source=None: (np.linspace(1., 3.0, 21), np.array(
                    [6.25, 10.5843164, 16.95755409, 25.70284567, 36.85673043, 50., 64.17129488, 77.91645797,
                     89.50250709, 97.26549474, 100., 97.26549474, 89.50250709, 77.91645797, 64.17129488, 50.,
                     36.85673043, 25.70284567, 16.95755409, 10.5843164, 6.25])) if not source else ([], [])
            }))

    # small corner case
    def test_default_params_sigma_0_8493_pts_per_mz_0_5(self):
        self.apply_and_assert(SimpleMock({
                    'get_spectrum': lambda source: (np.array([2.]), np.array([100.]))
                }), 0.8493218002880191, {'pts_per_mz': 0.5}, SimpleMock({
                    'get_spectrum': lambda source=None: (np.arange(1., 3.1, 2), np.array(
                        [100., 100.])) if not source else ([], [])
                }))

    # usual one
    def test_default_params_usual_case(self):
            # centroid function
            # (
            #     SimpleMock({
            #         'get_spectrum': lambda: (np.array([2.]), np.array([100.]))
            #     }), 2, {'pts_per_fwhm': 1, 'centroid_func': lambda x, y, **_: (x, 2 * y, [0, 1])}, SimpleMock({
            #         'get_spectrum': lambda source=None: (np.arange(1., 3.1, 2), np.array(
            #             [100., 100.])) if not source else (np.arange(1., 3.1, 2), np.array([200., 200.]))
            #     })
            # )
        self.apply_and_assert(*self._usual_case())

    def _usual_case(self):
        ms_in = MassSpectrum()
        ms_out = MassSpectrum()
        sigma = 0.004246609001440096
        pts_per_mz = 1500
        np.random.seed(0)
        mzs_in = np.sort(np.array([200.] * 10) + np.random.random_sample(10) * 800)
        np.random.seed()
        ints_in = scipy.stats.norm(700, 100).pdf(mzs_in)
        ints_in *= 100 / max(ints_in)
        ms_in.add_centroids(mzs_in, ints_in)
        mzs_out, ints_out = combinded_gaussian(mzs_in, ints_in, sigma, 699266)
        ints_out *= 100 / max(ints_out)
        ms_out.add_spectrum(mzs_out, ints_out)
        return ms_in, sigma, {'pts_per_mz': pts_per_mz}, ms_out


class CompleteIsoDist(unittest.TestCase):

    def test_centr_ints_greater_cutoff(self):
        sf = 'Au'
        adduct = '+H'
        sf_adduct = complex_to_simple(sf + adduct)
        sf_obj = SumFormulaParser.parse_string(sf_adduct)
        cutoff = 0.0001
        ms = complete_isodist(sf_obj, sigma=0.01, charge=1, pts_per_mz=10000, cutoff_perc=cutoff)
        centr_mzs, centr_ints = ms.get_spectrum(source='centroids')

        for intens in centr_ints:
            assert intens > cutoff


class SegmentStub(object):
    def __init__(self, atom, number):
        self._atom = atom
        self._number = number

    def element(self):
        return self._atom

    def amount(self):
        return self._number


if __name__ == '__main__':
    unittest.main()
