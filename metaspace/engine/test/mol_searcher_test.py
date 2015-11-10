__author__ = 'intsco'

import numpy as np
import unittest
from unittest import TestCase
from engine.formula_imager import *
from os.path import join, dirname, realpath
import cPickle
import json
from numpy.testing import assert_array_almost_equal
from engine.formula_imager import *


class BaseTest(TestCase):
    ds = '20150730_ANB_spheroid_control_65x65_15um'
    rows, cols = 65, 65
    data_dir = join(dirname(__file__), 'data/searcher_test', ds)

    with open(join(data_dir, 'queries.pkl')) as f:
        q = cPickle.load(f)
    formulas = q['formulas']

    with open(join(data_dir, 'config.json')) as f:
        ds_config = json.load(f)

    ds_path = join(data_dir, 'ds.txt')
    ds_coord_path = join(data_dir, 'ds_coord.txt')

    searcher = FormulaImager(ds_path, ds_coord_path, q['data'], np.array(q['intensities']), ds_config)
    sc = searcher.sc

    spectra = sc.textFile(ds_path, minPartitions=4).map(_txt_to_spectrum)


class FindSFCandidatesTest(BaseTest):

    def test_find_sf_candidates(self):
        cand = []
        step = 500
        self.spectra = self.spectra.collect()
        for sp_chunk in [self.spectra[i:i+step] for i in xrange(0, len(self.spectra), step)]:
            cand.append(find_candidates(sp_chunk, self.searcher._get_peak_bounds(),
                                        self.searcher.sf_peak_inds, self.searcher.theor_peak_intens))

        cand_sf_inds = [c for l in cand for c in l]
        cand_sf_set = set(np.array(self.formulas, dtype=object)[cand_sf_inds][:,0])

        ref_sf_set = set([632, 1726, 6004, 6115, 6202, 6213, 6433, 6654, 6735, 6865, 6946])

        cand_intersection = cand_sf_set.intersection(ref_sf_set)
        print 'Cand intersection {}, {} %'.format(
            sorted(cand_intersection), float(len(cand_intersection)) / len(ref_sf_set) * 100)
        print 'Missing ref sf:', sorted(ref_sf_set.difference(cand_sf_set))

        assert cand_sf_set.issuperset(ref_sf_set)


class SampleSpectrumTest(BaseTest):

    def setUp(self):
        self.sf_peak_inds = self.searcher._get_sf_peak_map()
        self.peak_bounds = self.searcher._get_peak_bounds()

        sf_i = 5225
        peak_inds = np.arange(len(self.sf_peak_inds))[self.sf_peak_inds[:,0] == sf_i]
        self.peak_bounds_one_sf = [bounds[peak_inds] for bounds in self.peak_bounds]
        self.sf_peak_inds_one_sf = self.sf_peak_inds[peak_inds]

    # def test_sample_one_spectrum(self):
    #     sp = self.spectra.take(2)[1]
    #     res = list(sample_spectrum(sp, self.peak_bounds, self.sf_peak_inds))
    #
    #     self.assertEqual(len(res), 1027)

    def test_sample_spectrum_one_sf(self):
        res = []
        for sp in self.spectra.collect():
            res.append(_sample_spectrum(sp, self.peak_bounds_one_sf, self.sf_peak_inds_one_sf))

        self.assertEqual(len(res), 4225)
        self.assertEqual(sum(map(lambda r: len(r)>0, res)), 2372)


class ComputeSFImagesTest(BaseTest):

    def setUp(self):
        # self.sf_cand_ind = [1461, 1905, 1906, 3669, 4946, 5225, 5257, 5549, 5767, 5890, 6114, 6489, 6514,
        #                     6700, 8046, 8092, 8435, 8494, 8495, 9871, 11990, 12033, 12454, 14236, 14714,
        #                     15567, 17645, 18019, 18029, 18030,
        #                     8435, 8494, 8495, 8906, 8951, 10243, 11990, 14714, 14858, 18046, 18398, 18399,
        #                     18653, 18654, 18686, 18687, 19362, 19374, 19375, 19550, 19985, 20022, 20023,
        #                     20234, 20258, 20585, 20642, 20657, 20658, 20870]
        # self.sf_cand_inds = range(0, 30294)
        pass

    def test_compute_sf_images(self):
        sf_images = self.searcher.compute_images(self.spectra)

        print len(sf_images)


class ComputeImgMeasuresTest(BaseTest):

    def setUp(self):
        self.sf_images = cPickle.load(open(join(self.data_dir, 'sf_images.pkl')))
        self.sf_i_C15H22O9_K = 5225
        self.sf_img_C15H22O9_K = cPickle.load(open(join(self.data_dir, 'C15H22O9_K_images.pkl')))[0][1]

    def test_compute_img_measures_without_exceptions(self):
        measures = []
        for sf_i, imgs in self.sf_images:
            theor_ints = self.searcher.theor_peak_intens[sf_i]
            measures.append(self.searcher.compute_images(self.spectra))

        self.assertEqual(len(self.sf_images), len(measures))

    def test_compute_img_measures_almost_equal(self):
        measures = self.searcher.compute_images(self.sf_img_C15H22O9_K,
                                                self.searcher.theor_peak_intens[self.sf_i_C15H22O9_K],
                                                self.rows, self.cols)

        assert_array_almost_equal(measures, (0.998207733559, 0.55484692205, 0.977315866329))

if __name__ == '__main__':
    unittest.main()
    # stest = SearcherTest()
    # # stest.test_find_sf_candidates()
    # stest.test_search_peak_ints()