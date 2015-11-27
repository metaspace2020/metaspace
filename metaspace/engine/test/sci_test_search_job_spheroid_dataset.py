from __future__ import division
from os.path import join, dirname
from subprocess import check_call
import pytest
import argparse

from docutils.nodes import row
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

sample_ds_report_insert = "INSERT INTO sample_dataset_report VALUES (%s, %s, %s, %s)"
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


@pytest.fixture(scope='module')
def _master_hash():
    # return local('git rev-parse --short master')
    return '51f2dd1'


def _get_sf_adduct_pairs(report):
    return set(map(lambda r: (r[0], r[1]), report))


def _compare_reports(base_report, report):
    base_sf_adduct = _get_sf_adduct_pairs(base_report)
    sf_adduct = _get_sf_adduct_pairs(report)
    assert base_sf_adduct == sf_adduct

    for br, r in zip(base_report, report):
        br_metr, r_metr = br[2], r[2]
        for m in br_metr.keys():
            assert_almost_equal(br_metr[m], r_metr[m])


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

        base_report = self.db.select_one(sample_ds_report_select, (_master_hash(), ds_name))[0]
        report = self.db.select(make_report_select, (ds_name, 'HMDB'))
        _compare_reports(base_report, report)

    def save_sci_test_report(self):
        # self._run_search()

        branch = local("git branch|head -n1", capture=True).strip(' *')
        if branch != 'master':
            print 'Error! Checkout master branch first'
        else:
            commit_hash = local('git rev-parse --short master', capture=True)
            commit_message = local("git log --abbrev-commit -n1", capture=True)

            report = self.db.select(make_report_select, (ds_name, 'HMDB'))

            rows = [(commit_hash, commit_message, ds_name, '', report)]
            print rows
            # self.db.insert(sample_ds_report_insert, rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scientific test runner')
    parser.add_argument('-r', '--run', action='store_true', help='compare current results with previous')
    parser.add_argument('-s', '--save', action='store_true', help='store current results')
    args = parser.parse_args()

    sci_tester = SciTester()
    if args.run:
        sci_tester.run_sci_test()
    if args.save:
        sci_tester.save_sci_test_report()
    else:
        print 'Dry run'
