"""
.. module::
    :synopsis: Script for running molecule search

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import argparse
import time
import json
from engine.search_job import SearchJob


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('--out', dest='out_fn', type=str, help='filename')
    parser.add_argument('--ds', dest='ds_path', type=str, help='dataset file name')
    parser.add_argument('--coord', dest='coord_path', type=str, help='dataset coordinates file name')
    parser.add_argument('--queries', dest='queries', type=str, help='queries file name')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='dataset config file path')
    parser.set_defaults(queries='queries.pkl', fname='result.pkl')

    from engine import util

    start = time.time()
    args = parser.parse_args()

    # Dataset config
    with open(args.ds_config_path) as f:
        ds_config = json.load(f)

    # SM config
    with open('../conf/config.json') as f:
        sm_config = json.load(f)

    util.my_print("Processing...")

    job = SearchJob(args.ds_path, args.coord_path, ds_config, sm_config)
    job.run()

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))
