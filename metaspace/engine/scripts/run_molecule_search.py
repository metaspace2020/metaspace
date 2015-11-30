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
from engine import util


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('input_path', type=str, help='path to a dataset location')

    start = time.time()
    args = parser.parse_args()

    # Dataset config
    with open(join(args.input_path, 'config.json')) as f:
        ds_config = json.load(f)

    # SM config
    proj_dir = dirname(dirname(__file__))
    with open(join(proj_dir, 'conf/config.json')) as f:
        sm_config = json.load(f)

    util.my_print("Processing...")

    job = SearchJob(ds_config, sm_config)
    job.run(args.input_path)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))
