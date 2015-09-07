from __future__ import division

__author__ = 'intsco'

import unittest
from unittest import TestCase
from os.path import join, dirname, realpath
from util import Config
from subprocess import check_call
import json
import psycopg2
import cPickle
import pandas as pd
from pandas.util.testing import assert_frame_equal


class RunProcessDatasetTest(TestCase):

    def setUp(self):
        self.ds = '20150730_ANB_spheroid_control_65x65_15um'
        self.rows, self.cols = 65, 65

        self.base_path = realpath(join('data/run_process_dataset_test', self.ds))
        self.out_path = join(self.base_path, 'results.pkl')
        self.text_out_path = join(self.base_path, 'results.csv')
        self.ds_path = join(self.base_path, 'ds.txt')
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
        ref_df = ref_df.set_index(['sf', 'adduct'])
        res_df = res_df.set_index(['sf', 'adduct'])

        res_sf_set = set(res_df.index)
        ref_sf_set = set(ref_df.index)

        # Results contain all ref sum formulas
        self.assertTrue(res_sf_set.issuperset(ref_sf_set))

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
                self.assertAlmostEqual(res_metrics[m], ref_metrics[m], places=2)


if __name__ == '__main__':
    unittest.main()
