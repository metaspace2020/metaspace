"""
.. module::
    :synopsis: Script for running molecule search

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import argparse
import time
import json
from os.path import join, dirname

from engine.search_job import SearchJob
from engine.util import SMConfig


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('ds_name', type=str, help='Dataset name')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    start = time.time()
    args = parser.parse_args()

    print "Processing..."

    SMConfig.set_path(args.sm_config_path)

    job = SearchJob(args.ds_name)
    job.run(args.input_path)

    print "All done!"
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))
