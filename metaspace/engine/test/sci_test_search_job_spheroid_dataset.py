from __future__ import division
from os.path import join, dirname
from subprocess import check_call
import pytest
import argparse
from datetime import datetime
import json
from fabric.api import local
from numpy.testing import assert_almost_equal

from engine.db import DB
from engine.test.util import sm_config, ds_config, create_test_db, drop_test_db

proj_dir_path = dirname(dirname(__file__))
ds_name = 'spheroid_12h'
data_dir_path = join(proj_dir_path, 'data', ds_name)
test_dir_path = join(proj_dir_path, 'test/data/test_search_job_spheroid_dataset')
test_dir_ds_path = join(test_dir_path, ds_name)
agg_formula_path = join(test_dir_path, 'agg_formula.csv')

sample_ds_report_insert = "INSERT INTO sample_dataset_report VALUES (%s, %s, %s, %s, %s)"
sample_ds_report_select = ("SELECT report from sample_dataset_report "
                           "WHERE hash = %s AND ds_name = %s "
                           "ORDER BY dt DESC")
make_report_select = ("select sf, adduct, stats "
                      "from iso_image_metrics s "
                      "join formula_db db on db.id = s.db_id "
                      "join agg_formula f on f.id = s.sf_id "
                      "join job j on j.id = s.job_id "
                      "join dataset ds on ds.id = j.ds_id "
                      "where ds.name = %s and db.name = %s "
                      "ORDER BY sf, adduct ")


def _master_head_hash():
    return local('git rev-parse --short master', capture=True)


def _get_sf_adduct_dict(report):
    return {(r[0], r[1]): r[2] for r in report}


def _compare_reports(base_report, report):
    base_sf_adduct_dict = _get_sf_adduct_dict(base_report)
    sf_adduct_dict = _get_sf_adduct_dict(report)

    missed_sf_adduct = set(base_sf_adduct_dict.keys()).difference(set(sf_adduct_dict.keys()))
    print 'Missed formulas: {:.1f}%'.format(len(missed_sf_adduct) / len(base_sf_adduct_dict) * 100)
    print list(missed_sf_adduct)

    new_sf_adduct = set(sf_adduct_dict.keys()).difference(set(base_sf_adduct_dict.keys()))
    print 'False discovery formulas: {:.1f}%'.format(len(new_sf_adduct) / len(sf_adduct_dict) * 100)
    print list(new_sf_adduct)

    print 'Differences in metrics'
    for b_sf_add, b_stat in base_sf_adduct_dict.iteritems():
        if b_sf_add in sf_adduct_dict.keys():
            stat = sf_adduct_dict[b_sf_add]

            for s in b_stat.keys():
                diff = abs(b_stat[s] - stat[s])
                if diff > 1e-6:
                    print '{} -> {} diff = {}'.format(b_sf_add, s, diff)


class SciTester(object):

    def __init__(self):
        db_config = {
            "host": "localhost",
            "database": "sm",
            "user": "sm",
            "password": "1321"
        }
        self.db = DB(db_config)

    def _run_search(self):
        cmd = ['python', join(proj_dir_path, 'scripts/run_molecule_search.py'), test_dir_ds_path]
        check_call(cmd)

    def run_sci_test(self):
        self._run_search()

        base_report = self.db.select_one(sample_ds_report_select, (_master_head_hash(), ds_name))[0]
        report = self.db.select(make_report_select, (ds_name, 'HMDB'))
        _compare_reports(base_report, report)

    def save_sci_test_report(self):
        self._run_search()

        branch = local("git rev-parse --abbrev-ref HEAD", capture=True)
        status = local('git status -s', capture=True)
        if branch != 'master':
            print 'Wrong branch {}! Checkout master branch first'.format(branch)
        elif status:
            print 'Uncommitted changes in files:\n{}'.format(status)
        else:
            commit_hash = local('git rev-parse --short master', capture=True)
            commit_message = local("git log --abbrev-commit -n1", capture=True)

            report = self.db.select(make_report_select, (ds_name, 'HMDB'))
            dt = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            print commit_message
            print dt
            for r in report:
                print r
            self.db.insert(sample_ds_report_insert,
                           [(commit_hash, commit_message, ds_name, dt, json.dumps(report))])

            print 'Successfully saved sample dataset search report'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scientific test runner')
    parser.add_argument('-r', '--run', action='store_true', help='compare current search results with previous')
    parser.add_argument('-s', '--save', action='store_true', help='store current search results')
    args = parser.parse_args()

    sci_tester = SciTester()
    if args.run:
        sci_tester.run_sci_test()
    elif args.save:
        sci_tester.save_sci_test_report()
    else:
        print 'Dry run'
