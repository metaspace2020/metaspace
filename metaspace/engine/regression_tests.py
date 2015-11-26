#!/usr/bin/python

from fabric.api import local
import argparse

parser = argparse.ArgumentParser(description='Tests runner for SM engine')
parser.add_argument('-u', '--unit', action='store_true', help='run unit tests only')
parser.add_argument('-r', '--regr', action='store_true', help='run regression tests only')
parser.add_argument('-a', '--all', action='store_true', help='run all tests')

args = parser.parse_args()
print args

py_test_cmd = 'py.test -x -v '

# Engine unit tests
if args.unit or args.all:
    local(py_test_cmd + 'engine/test')

# Regression tests
if args.regr or args.all:
    local(py_test_cmd + 'test/test_imzml_txt_converter_db.py')
    local(py_test_cmd + 'test/test_theor_peaks_gen_db.py')
    local(py_test_cmd + 'test/test_work_dir.py')
    local(py_test_cmd + 'test/test_search_job_artificial_data.py')
    local(py_test_cmd + 'test/test_search_job_imzml_example.py')
    # Functional/scientific tests

if args.unit or args.all or args.regr:
    print 'All tests finished successfully'
else:
    print 'Dry run'

