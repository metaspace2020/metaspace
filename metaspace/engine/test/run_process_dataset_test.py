from __future__ import division

__author__ = 'intsco'

import unittest
from unittest import TestCase
from os.path import join, dirname, realpath
from engine.util import Config
from subprocess import check_call
import psycopg2
import cPickle
import pandas as pd


<<<<<<< HEAD
class RunProcessDatasetTest(TestCase):

    def setUp(self):
        self.ds = '20150730_ANB_spheroid_control_65x65_15um'
=======
from engine.computing_fast_spark import compute_img_measures
from numpy.testing import assert_array_almost_equal, assert_array_equal, assert_almost_equal


class ProcessDatasetBaseTest(TestCase):
    # C44H84NO8P is used as a reference SF

    def __init__(self):
        super.__init__(self, TestCase)
        self.sc = SparkContext(conf=SparkConf())

    def setUp(self):
        self.ds = '20150730_ANB_spheroid_control_65x65_15um'
        self.base_path = realpath(join('data/run_process_dataset_test', self.ds))
        self.ds_path = join(self.base_path, 'ds.txt')
        self.queries_path = join(self.base_path, 'C44H84NO8P_queries.pkl')
        self.rows, self.cols = 65, 65
        self.minPartitions = 4

        with open(self.queries_path) as f:
            self.sf_mz_intervals = cPickle.load(f)['data']

        ff = self.sc.textFile(self.ds_path, minPartitions=self.minPartitions)
        self.spectra = ff.map(txt_to_spectrum)


class SampleSpectraSpheroidsTest(ProcessDatasetBaseTest):

    def test_sf_peak_iso_images(self):
        search_res = search_peak_ints(self.sc, self.spectra, self.sf_mz_intervals,
                                      self.rows, self.cols, self.minPartitions).collect()

        self.assertTrue(len(search_res) > 0)

        sf_adduct_images = search_res[2][1]  # adduct = 2 (K)
        # self.assertEqual(len(sf_adduct_images), 6)

        assert_array_equal([img.nnz if img is not None else 0 for img in sf_adduct_images],
                           [2941, 2496, 0, 194, 0, 0, 195])
                           # [2940, 2495, 0, 193, 0, 0, 194])

        # some particular pixel intensities
        self.assertAlmostEqual(sf_adduct_images[6][29,7], 108.809120178, places=4)


class IsoImagesMeasuresSpheroidsTest(ProcessDatasetBaseTest):

    def setUp(self):
        ProcessDatasetBaseTest.setUp(self)

        with open(self.queries_path) as f:
            self.sf_ints = cPickle.load(f)['intensities'][2] # adduct = 2 (K)

    def test_img_measures(self):
        search_res = search_peak_ints(self.sc, self.spectra, self.sf_mz_intervals,
                                      self.rows, self.cols, self.minPartitions).collect()

        sf_adduct_images = search_res[2][1]  # adduct = 2 (K)
        measures = compute_img_measures(sf_adduct_images, self.sf_ints, self.rows, self.cols)
        prec = 4

        assert_array_almost_equal(np.array(measures),
                                  np.array([0.9981978919, 0.6710982074, 0.9650823573]),
                                  decimal=prec)


def assert_sf_res_dataframes_equal(res_df, ref_df):
    ref_df = ref_df.set_index(['sf', 'adduct'])
    res_df = res_df.set_index(['sf', 'adduct'])

    res_sf_set = set(res_df.index)
    ref_sf_set = set(ref_df.index)

    # Results should contain all ref sum formulas
    assert res_sf_set.issuperset(ref_sf_set)

    print 'FDR: ', len(res_sf_set.difference(ref_sf_set)) / len(res_sf_set)
    print list(res_sf_set.difference(ref_sf_set))
    print

    for sf_adduct in ref_df.index:
        print sf_adduct

        res_metrics = res_df.loc[sf_adduct].to_dict()
        ref_metrics = ref_df.loc[sf_adduct].to_dict()
        print 'Res metrics: ', res_metrics
        print 'Ref metrics: ', ref_metrics

        for m in ref_metrics:
            assert_almost_equal(res_metrics[m], ref_metrics[m], decimal=2)


class RunProcessDatasetTestBase(TestCase):
    ds = None

    def setUp(self):
        # self.ds = '20150730_ANB_spheroid_control_65x65_15um'
>>>>>>> One more attempt to make molecules search faster.
        self.rows, self.cols = 65, 65

        self.base_path = realpath(join('data/run_process_dataset_test', self.ds))
        self.out_path = join(self.base_path, 'results.pkl')
        self.text_out_path = join(self.base_path, 'results.csv')
        self.ds_path = join(self.base_path, 'ds.txt')
        # self.queries_path = join(self.base_path, 'C44H84NO8P_queries.pkl')
        self.queries_path = join(self.base_path, 'queries.pkl')
        self.ref_res_path = join(self.base_path, 'ref_result_sf_metrics.csv')
        self.run_process_dataset_script = join(dirname(dirname(realpath(__file__))), 'scripts/run_process_dataset.py')

        self.adducts = {0: 'H', 1: 'Na', 2: 'K'}
        self.config = Config.get_config()
        self.config_path = Config.get_config_path()

    def run_process_dataset(self):
        cmd = ['python', self.run_process_dataset_script,
               '--config', self.config_path,
               '--out', self.out_path,
               '--ds', self.ds_path,
               '--queries', self.queries_path,
               '--rows', str(self.rows),
               '--cols', str(self.cols)]
        check_call(cmd)

    def load_results_df(self, columns):
        with open(self.out_path) as f:
            res = cPickle.load(f)

        conn = psycopg2.connect(**self.config['db'])
        curs = conn.cursor()

        res_list = []
        for i, sf_id in enumerate(res['formulas']):
            add_id = res['mzadducts'][i]
            adduct = self.adducts[add_id]
            curs.execute('select sf from agg_formulas where id = %s;', (sf_id,))
            sf = curs.fetchone()[0]
            moc = res['stat_dicts'][i]['moc']
            spec = res['stat_dicts'][i]['spec']
            spat = res['stat_dicts'][i]['spat']
            res_list.append((sf, adduct, moc, spec, spat))

        res_df = pd.DataFrame(data=res_list, columns=columns)
        res_df.to_csv(self.text_out_path, sep='\t', index=False)
        return res_df

    def test_run(self):
        self.run_process_dataset()

        ref_df = pd.read_csv(self.ref_res_path, sep='\t').drop(['ID', 'mz'], axis=1)
        res_df = self.load_results_df(ref_df.columns.values)

        assert_sf_res_dataframes_equal(res_df, ref_df)


if __name__ == '__main__':
    unittest.main()
