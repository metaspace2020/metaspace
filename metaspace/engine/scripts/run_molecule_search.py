"""
Script for running molecule search
"""
import argparse
import sys

from sm.engine.util import SMConfig, logger
from sm.engine.search_job import SearchJob


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('ds_id', type=str, help='Unique dataset identifier')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--ds-name', dest='ds_name', type=str, help='Dataset name')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='Path to a dataset config file')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    parser.add_argument('--no-clean', dest='no_clean', action='store_true', help='do not clean interim files')

    args = parser.parse_args()

    job = SearchJob(args.ds_id, args.ds_name, args.input_path, args.sm_config_path)
    job.run(args.ds_config_path, clean=not args.no_clean)

    sys.exit()
