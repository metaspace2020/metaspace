#!/usr/bin/python
"""
test_runner
-----------
A handy module for easy tests running
"""

import os
from fabric.api import local
from fabric.context_managers import lcd
import argparse


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Test runner for SM engine')
    parser.add_argument('-u', '--unit', action='store_true', help='run unit tests only')
    parser.add_argument('-r', '--regr', action='store_true', help='run regression tests only')
    parser.add_argument('-s', '--sci', action='store_true', help='run scientific tests only')
    parser.add_argument('-a', '--all', action='store_true', help='run all tests')

    args = parser.parse_args()
    print args

    py_test_cmd = 'py.test -x -v '

    with lcd(os.path.dirname(__file__)):
        # Engine unit tests
        if args.unit or args.all:
            local(py_test_cmd + 'sm/engine/tests')

        # Regression tests
        if args.regr or args.all:
            local(py_test_cmd + 'tests/test_imzml_txt_converter_db.py')
            local(py_test_cmd + 'tests/test_theor_peaks_gen_db.py')
            local(py_test_cmd + 'tests/test_work_dir.py')
            local(py_test_cmd + 'tests/test_dataset_db.py')
            local(py_test_cmd + 'tests/test_search_results.py')
            local(py_test_cmd + 'tests/test_es_exporter.py')
            local(py_test_cmd + 'tests/test_search_job_imzml_example.py')

        # Functional/scientific tests
        if args.sci or args.all:
            local('python tests/sci_test_search_job_spheroid_dataset.py --run')

        if args.unit or args.all or args.regr or args.sci:
            print 'ALL TESTS FINISHED SUCCESSFULLY'
        else:
            parser.print_help()