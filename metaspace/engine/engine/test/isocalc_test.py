__author__ = 'intsco'

import unittest
from unittest import TestCase
import pandas as pd
from engine.isocalc import get_iso_mzs


class IsocalcTest(TestCase):

    def setUp(self):
        self.ppm = 1.0
        self.ref_res_path = 'data/20150730_ANB_spheroid_control_65x65_15um_sf_adduct_centroids.txt'
        ref_res_df = pd.read_csv(self.ref_res_path, sep='\t')
        ref_res_df = ref_res_df.set_index(ref_res_df.sf + ref_res_df.adduct)
        self.sf_mz_peak_map = ref_res_df['mz'].to_dict()

    def test_centr_ref_mz_equality(self):
        for sf, ref_mz in self.sf_mz_peak_map.iteritems():
            self.assertAlmostEqual(get_iso_mzs(sf)['centr_mzs'][0], ref_mz, places=4)

    def get_mz_tol(self, mz):
        return self.ppm * mz / 1e6

    def test_ref_mz_belongs_centr_mz_interval(self):
        for sf, ref_mz in self.sf_mz_peak_map.iteritems():
            centr_mzs = get_iso_mzs(sf)['centr_mzs']
            mz_tol = self.get_mz_tol(centr_mzs[0])
            self.assertTrue(centr_mzs[0] - mz_tol <= ref_mz <= centr_mzs[0] + mz_tol)

if __name__ == '__main__':
    unittest.main()
