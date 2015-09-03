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


class RunProcessDataset(TestCase):

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

    def test_run(self):
        self.run_process_dataset()
        ref_df = pd.read_csv(self.ref_res_path, sep='\t').drop(['ID', 'mz', 'spec', 'spat'], axis=1)

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

            res_list.append((sf, adduct,
                             moc,
                             # spec,
                             # spat
                             ))
        res_df = pd.DataFrame(data=res_list, columns=ref_df.columns.values)
        res_df.to_csv(self.text_out_path, sep='\t', index=False)

        self.assertEqual(len(res_df), len(ref_df))

        ref_df = ref_df.set_index(['sf', 'adduct'])
        res_df = res_df.set_index(['sf', 'adduct'])

        self.assertSetEqual(set(res_df.index), set(ref_df.index))

        for sf_adduct in res_df.index:
            print sf_adduct[0]
            self.assertAlmostEqual(res_df.loc[sf_adduct], ref_df.loc[sf_adduct], places=3)


if __name__ == '__main__':
    unittest.main()
