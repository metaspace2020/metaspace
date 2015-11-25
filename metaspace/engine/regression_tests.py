#!/usr/bin/python

from fabric.api import local

py_test_cmd = 'py.test -x -v '

# Engine unit tests
local(py_test_cmd + 'engine/test')
# Regression tests
local(py_test_cmd + 'test/test_imzml_txt_converter_db.py')
local(py_test_cmd + 'test/test_theor_peaks_gen_db.py')
local(py_test_cmd + 'test/test_work_dir.py')
local(py_test_cmd + 'test/test_search_job_artificial_data.py')
local(py_test_cmd + 'test/test_search_job_imzml_example.py')
# Functional tests

print 'All tests finished successfully'
