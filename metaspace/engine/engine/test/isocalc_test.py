__author__ = 'intsco'

import unittest
from unittest import TestCase
import pandas
from cStringIO import StringIO
from engine.pyisocalc_wrapper import get_iso_peaks


class IsocalcTest(TestCase):

    def setUp(self):
        self.ref_data_file = StringIO('''
sf	adduct	mz
C44H84NO8P	H	786.600730639
C44H84NO8P	K	824.556616822
C18H39N	H	270.315526731
C43H76NO7P	Na	772.5251603989999
C13H8O5	Na	267.02639455599996
C40H78NO8P	H	732.553780449
C40H78NO8P	K	770.509666632
C39H73O8P	Na	723.4935259189999
C39H73O8P	K	739.467467573
C19H24N2O2	H	313.191054501
C42H82NO8P	H	760.585080579
C42H82NO8P	Na	782.5670252089999
C42H82NO8P	K	798.5409667519999
C19H12O7	Na	375.047523851
C41H72NO7P	Na	744.4938602689999
C38H76NO8P	Na	728.5200750189999
C38H76NO8P	K	744.494016673
C39H79N2O6P	Na	725.556794879
C39H79N2O6P	K	741.530736533
C24H22O13	K	557.0692019109999
C15H22O9	K	385.089543431
C45H76NO7P	Na	796.5251603989999
C17H12O4	H	281.08083535099996
C43H74NO7P	Na	770.5095103389999
C42H80NO8P	K	796.5253166919999
C16H22O4	Na	301.141030376
C11H12O7	K	295.021463861
C37H68O4	H	577.519036119
C45H78NO7P	Na	798.5408104589999''')
        self.ppm = 1.0
        # self.ref_res_path = 'data/20150730_ANB_spheroid_control_65x65_15um_sf_adduct_centroids.txt'

        ref_res_df = pandas.read_csv(self.ref_data_file, sep='\t', skiprows=1)
        ref_res_df = ref_res_df.set_index(ref_res_df.sf + ref_res_df.adduct)
        self.sf_mz_peak_map = ref_res_df['mz'].to_dict()

    def test_centr_ref_mz_equality(self):
        for sf, ref_mz in self.sf_mz_peak_map.iteritems():
            self.assertAlmostEqual(get_iso_peaks(sf)['centr_mzs'][0], ref_mz, places=4)

    def get_mz_tol(self, mz):
        return self.ppm * mz / 1e6

    def test_ref_mz_belongs_centr_mz_interval(self):
        for sf, ref_mz in self.sf_mz_peak_map.iteritems():
            centr_mzs = get_iso_peaks(sf)['centr_mzs']
            mz_tol = self.get_mz_tol(centr_mzs[0])
            self.assertTrue(centr_mzs[0] - mz_tol <= ref_mz <= centr_mzs[0] + mz_tol)

if __name__ == '__main__':
    unittest.main()
