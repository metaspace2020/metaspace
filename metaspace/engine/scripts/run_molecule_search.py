"""
.. module::
    :synopsis: Script for running molecule search

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import argparse
import time
import logging

from engine.search_job import SearchJob
from engine.util import SMConfig


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('ds_name', type=str, help='Dataset name')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    parser.add_argument('--clean', dest='clean', action='store_true', help='clean all interim data')

    start = time.time()
    args = parser.parse_args()

    logger = logging.getLogger('SM')
    logger.setLevel(logging.DEBUG)
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    frm = logging.Formatter(('%(asctime)s - %(levelname)s - %(name)s - '
                             '%(filename)s:%(lineno)d - %(message)s'))
    ch.setFormatter(frm)
    logger.addHandler(ch)

    SMConfig.set_path(args.sm_config_path)

    logger.info("Processing...")

    job = SearchJob(args.ds_name)
    job.run(args.input_path, clean=args.clean)

    logger.info("All done!")
    time_spent = time.time() - start
    logger.info('Time spent: %d mins %d secs', int(round(time_spent/60)), int(round(time_spent%60)))
