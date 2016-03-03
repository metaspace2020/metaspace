"""
Script for running molecule search
"""
import argparse
import time

from engine.search_job import SearchJob
from engine.util import SMConfig, logger
from pprint import pformat


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('ds_name', type=str, help='Dataset name')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    parser.add_argument('--no-clean', dest='no_clean', action='store_true', help='do not clean interim files')

    start = time.time()
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    logger.debug('Using SM config:\n%s', pformat(SMConfig.get_conf()))

    logger.info("Processing...")

    job = SearchJob(args.ds_name)
    job.run(args.input_path, clean=not args.no_clean)

    logger.info("All done!")
    time_spent = time.time() - start
    logger.info('Time spent: %d mins %d secs', int(round(time_spent/60)), int(round(time_spent%60)))
