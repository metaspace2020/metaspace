__author__ = 'intsco'

from subprocess import check_call
import unittest
from unittest import TestCase
from os.path import realpath, dirname, join
import numpy as np
from numpy.testing import assert_array_almost_equal


class ImzmlToTxtTest(TestCase):

    def setUp(self):
        self.ds_name = '20150730_ANB_spheroid_control_65x65_15um'
        self.imzml_to_txt_script_path = join(dirname(dirname(realpath(__file__))), 'scripts/imzml_to_txt.py')
        self.test_data_dir_path = join(dirname(realpath(__file__)), 'data/imzml_to_txt_test', self.ds_name)
        self.imzml_file_path = join(self.test_data_dir_path, 'data.imzML')
        self.txt_file_path = join(self.test_data_dir_path, self.imzml_file_path.split('.')[0] + '.txt')
        self.coord_file_path = join(self.test_data_dir_path, self.imzml_file_path.split('.')[0] + '_coord.txt')

    def test_imzml_to_txt_output_file(self):
        print 'Input file:', self.imzml_file_path

        cmd = ['python', self.imzml_to_txt_script_path,
               self.imzml_file_path,
               self.txt_file_path,
               self.coord_file_path]
        check_call(cmd)

        ref_mzs = np.array([
            260.9406433105469, 286.7884521484375, 307.66387939453125, 318.5805969238281, 334.97344970703125, 343.49530029296875,
            347.7315673828125, 358.54583740234375, 359.4187316894531, 361.79290771484375, 366.6364440917969, 384.12554931640625,
            395.9488525390625, 398.7591857910156, 408.0068054199219, 426.2171630859375, 436.8468933105469, 459.2687683105469,
            467.7320861816406, 518.3319091796875, 648.7938842773438, 723.133056640625, 723.1918334960938, 723.2105712890625,
            723.2247924804688, 748.0703735351562, 751.7091674804688, 825.0732421875, 931.0093383789062, 935.7303466796875])

        with open(self.txt_file_path) as f:
            sp_id, mzs_str, ints_str = f.readline().strip('\n').split('|')
            mzs = map(float, mzs_str.split(' '))
            assert_array_almost_equal(mzs, ref_mzs, decimal=3)


if __name__ == '__main__':
    unittest.main()
