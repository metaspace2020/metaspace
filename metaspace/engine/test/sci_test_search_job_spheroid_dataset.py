from __future__ import division
from os.path import join, dirname
from subprocess import check_call
import argparse
import json
import numpy as np
from fabric.api import local
from fabric.context_managers import warn_only
from operator import mul, add
from pprint import pprint

from engine.db import DB
from engine.util import proj_root, hdfs_prefix, SMConfig


# def sm_config():
#     with open(join(proj_root(), 'conf/config.json')) as f:
#         return json.load(f)

SMConfig.set_path(join(proj_root(), 'conf/config.json'))
sm_config = SMConfig.get_conf()

ds_name = 'sci_test_spheroid_12h'
data_dir_path = join(SMConfig.get_conf()['fs']['data_dir'], ds_name)
input_dir_path = join(proj_root(), 'test/data/sci_test_search_job_spheroid_dataset')

SEARCH_RES_SELECT = ("select sf, adduct, stats "
                     "from iso_image_metrics s "
                     "join formula_db sf_db on sf_db.id = s.db_id "
                     "join agg_formula f on f.id = s.sf_id AND sf_db.id = f.db_id "
                     "join job j on j.id = s.job_id "
                     "join dataset ds on ds.id = j.ds_id "
                     "where ds.name = %s and sf_db.name = %s "
                     "ORDER BY sf, adduct ")


def print_metric_hist(metric_arr, bins=10):
    metric_freq, metric_interv = np.histogram(metric_arr, bins=np.linspace(0, 1, 11))
    metric_interv = map(lambda x: round(x, 2), metric_interv)
    pprint(zip(zip(metric_interv[:-1], metric_interv[1:]), metric_freq))


def compare_search_results(base_search_res, search_res):
    missed_sf_adduct = set(base_search_res.keys()).difference(set(search_res.keys()))
    print 'MISSED FORMULAS: {:.1f}%'.format(len(missed_sf_adduct) / len(base_search_res) * 100)
    if missed_sf_adduct:
        print list(missed_sf_adduct)

    if missed_sf_adduct:
        missed_sf_base_metrics = np.array([np.array(base_search_res[k]) for k in missed_sf_adduct])

        print "\nCHAOS HISTOGRAM"
        print_metric_hist(missed_sf_base_metrics[:, 0])
        print "\nIMG_CORR HISTOGRAM"
        print_metric_hist(missed_sf_base_metrics[:, 1])
        print "\nPAT_MATCH HISTOGRAM"
        print_metric_hist(missed_sf_base_metrics[:, 2])
        print "\nMSM HISTOGRAM"
        print_metric_hist([a*b*c for a, b, c in missed_sf_base_metrics])

    new_sf_adduct = set(search_res.keys()).difference(set(base_search_res.keys()))
    print '\nFALSE DISCOVERY: {:.1f}%'.format(len(new_sf_adduct) / len(base_search_res) * 100)

    for sf_adduct in new_sf_adduct:
        metrics = search_res[sf_adduct]
        msm = reduce(mul, map(lambda m: m if m >= 0 else 0, metrics))
        print '{} metrics = {}, MSM = {}'.format(sf_adduct, metrics, msm)

    print '\nDIFFERENCE IN METRICS'
    metric_diffs = []
    for b_sf_add, b_metr in base_search_res.iteritems():
        if b_sf_add in search_res.keys():
            metr = search_res[b_sf_add]
            diff = b_metr - metr
            if np.any(np.abs(diff) > 1e-6):
                metric_diffs.append(diff)
                print '{} metrics diff = {}'.format(b_sf_add, diff)

    if metric_diffs:
        metric_diffs = np.asarray(metric_diffs)
        print "\nCHAOS HISTOGRAM"
        print_metric_hist(metric_diffs[:, 0])
        print "\nIMG_CORR HISTOGRAM"
        print_metric_hist(metric_diffs[:, 1])
        print "\nPAT_MATCH HISTOGRAM"
        print_metric_hist(metric_diffs[:, 2])


def zip_engine():
    local('cd {}; zip -rq sm.zip engine'.format(proj_root()))


def run_search():
    cmd = ['python',
           join(proj_root(), 'scripts/run_molecule_search.py'),
           ds_name,
           input_dir_path]
    check_call(cmd)


def clear_data_dirs():
    with warn_only():
        local('rm -rf {}'.format(data_dir_path))
        if not sm_config['fs']['local']:
            local(hdfs_prefix() + '-rm -r {}'.format(data_dir_path))


class SciTester(object):

    def __init__(self):
        self.db = DB(sm_config['db'])
        self.base_search_res_path = join(proj_root(), 'test/reports', 'spheroid_12h_search_res.csv')
        self.metrics = ['chaos', 'spatial', 'spectral']

    def metr_dict_to_array(self, metr_d):
        return np.array([metr_d[m] for m in self.metrics])

    def read_base_search_res(self):
        with open(self.base_search_res_path) as f:
            rows = map(lambda line: line.strip('\n').split('\t'), f.readlines()[1:])
            return {(r[0], r[1]): np.array(r[2:], dtype=float) for r in rows}

    def fetch_search_res(self):
        rows = self.db.select(SEARCH_RES_SELECT, ds_name, 'HMDB')
        return {(r[0], r[1]): self.metr_dict_to_array(r[2]) for r in rows}

    def run_sci_test(self):
        compare_search_results(self.read_base_search_res(), self.fetch_search_res())

    def save_sci_test_report(self):
        with open(self.base_search_res_path, 'w') as f:
            f.write('\t'.join(['sf', 'adduct'] + self.metrics) + '\n')
            for (sf, adduct), metrics in sorted(self.fetch_search_res().iteritems()):
                f.write('\t'.join([sf, adduct] + metrics.astype(str).tolist()) + '\n')

        print 'Successfully saved sample dataset search report'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scientific test runner')
    parser.add_argument('-r', '--run', action='store_true', help='compare current search results with previous')
    parser.add_argument('-s', '--save', action='store_true', help='store current search results')
    args = parser.parse_args()

    sci_tester = SciTester()

    if args.run:
        try:
            run_search()
            sci_tester.run_sci_test()
        finally:
            clear_data_dirs()
    elif args.save:
        resp = raw_input('You are going to replace the reference values. Are you sure? (y/n): ')
        if resp == 'y':
            sci_tester.save_sci_test_report()
    else:
        parser.print_help()
