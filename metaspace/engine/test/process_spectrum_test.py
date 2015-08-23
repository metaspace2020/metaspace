__author__ = 'intsco'

from engine.computing import process_spectrum_onequery, process_spectrum_multiple_queries
import cPickle
import unittest
from unittest import TestCase


class ProcessSpectrumQueries(TestCase):

    def setUp(self):
        self.spectra = cPickle.load(open('data/20150730_ANB_spheroid_control_65x65_15um_spectra.pkl'))
        self.queries = cPickle.load(open('data/20150730_ANB_spheroid_control_65x65_15um_queries.pkl'))
        self.rows, self.cols = 65, 65

    def test_foo(self):
        number_of_nonzero_ints_thr = round(self.rows * self.cols / 100)

        # for sp in self.spectra:
            # for i, mz_intervals in enumerate(self.queries['data']):
            #     sp_centr_ints = process_spectrum_onequery(mz_intervals, sp)
            #
            #     print sp[0], self.queries['formulas'][i], self.queries['mzadducts'][i], len(sp_centr_ints)
            #     assert len(sp_centr_ints) > number_of_nonzero_ints_thr

            # v = process_spectrum_multiple_queries(self.queries['data'], sp)
            # pass

        passed_molecules = 0
        for i, mz_intervals in enumerate(self.queries['data']):
            sp_peak_ints = map(lambda sp: process_spectrum_onequery(mz_intervals, sp), self.spectra)
            n = sum([len(d) > 0 for sp_pk in sp_peak_ints for d in sp_pk])
            print i, mz_intervals, n

            if n > number_of_nonzero_ints_thr:
                passed_molecules += 1

        self.assertEqual(passed_molecules, len(self.queries['data']))

if __name__ == '__main__':
    unittest.main()
