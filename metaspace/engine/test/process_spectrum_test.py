__author__ = 'intsco'

from engine.computing import process_spectrum_onequery, process_spectrum_multiple_queries, txt_to_spectrum
import cPickle
import unittest
from unittest import TestCase
from os.path import realpath, dirname, join


class ProcessSpectrumQueriesTest(TestCase):

    def setUp(self):
        self.ds_name = '20150730_ANB_spheroid_control_65x65_15um'
        self.test_data_dir_path = join(dirname(realpath(__file__)), 'data/process_spectrum_test', self.ds_name)
        self.txt_file_path = join(self.test_data_dir_path, 'data.txt')
        self.queries = cPickle.load(open(join(self.test_data_dir_path, 'queries.pkl')))
        # self.spectra = cPickle.load(open(join(self.test_data_dir, 'spectra.pkl')))
        self.rows, self.cols = 65, 65

    def test_foo(self):
        # TO-DO: ask Andy about a better threshold value
        number_of_nonzero_ints_thr = round(self.rows * self.cols / 100)

        with open(self.txt_file_path) as f:
            lines = f.readlines()
            spectra = map(lambda s: txt_to_spectrum(s.strip('\n')), lines)

            passed_molecules = 0
            for i, mz_intervals in enumerate(self.queries['data']):
                sp_centr_ints = map(lambda sp: process_spectrum_onequery(mz_intervals, sp), spectra)
                n = sum([len(d) > 0 for sp_pk in sp_centr_ints for d in sp_pk])
                print 'Molecule id: {}, mz_intervals: {}\nnumber of matched pixels: {}'.format(i, mz_intervals, n)

                if n > number_of_nonzero_ints_thr:
                    passed_molecules += 1

            self.assertEqual(passed_molecules, len(self.queries['data']))

if __name__ == '__main__':
    unittest.main()
