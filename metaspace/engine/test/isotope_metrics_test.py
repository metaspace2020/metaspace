__author__ = 'intsco'

import unittest
from os.path import join, realpath, dirname
import cPickle
from engine.computing import *
from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos_dict


class IsotopeMetricsTest(unittest.TestCase):

    def setUp(self):
        self.ds_name = '20150731_ANB_lipidmix2_20x20_15um_pos_1'
        self.path = join(dirname(realpath(__file__)), 'data/isotope_metrics_test', self.ds_name, 'unit_test_input_C33H62O6_Na.pkl')
        self.rows = 20
        self.cols = 20
        self.dec_places = 4

        self.nlevels = 30
        self.qval = 99
        self.interp = True

        with open(self.path) as f:
            self.sf, self.adduct, self.imgs, self.theor_iso_ints = cPickle.load(f)

    def test_iso_pattern_match(self):
        self.assertAlmostEqual(iso_pattern_match(self.imgs, self.theor_iso_ints), 0.996819266322, places=self.dec_places)

    def test_avg_img_corr(self):
        self.assertAlmostEqual(iso_img_correlation(self.imgs, theor_iso_ints=self.theor_iso_ints), 0.989614474795, places=self.dec_places)

    # TO-DO: provide reference value computed with a different peace of code (not pyIMS.image_measures.level_sets_measure)
    def test_level_sets_measure(self):
        moc = 1 - measure_of_chaos_dict(self.imgs[0], self.rows, self.cols, nlevels=self.nlevels, interp=self.interp, q_val=self.qval)
        self.assertAlmostEqual(moc, 0.9922743055555555, places=self.dec_places)

if __name__ == '__main__':
    unittest.main()