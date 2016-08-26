#!/usr/bin/env python
"""
Script for running molecule search
"""
import argparse
import sys
from datetime import datetime as dt

from sm.engine.util import SMConfig, logger, sm_log_config, init_logger
from sm.engine.search_job import SearchJob


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('input_path', type=str, help='Path to a dataset location')
    parser.add_argument('--ds-name', dest='ds_name', type=str, help='Dataset name')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='Path to a dataset config file')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    args = parser.parse_args()

    init_logger()

    ds_id = dt.now().strftime("%Y-%m-%d_%Hh%Mm")
    job = SearchJob(ds_id, args.ds_name, args.input_path, args.sm_config_path)
    try:
        job.run(args.ds_config_path)
    except:
        pass

    sys.exit()
