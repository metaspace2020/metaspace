import argparse
import logging
from datetime import timedelta
from typing import Dict, List

import boto3

from sm.engine.db import DB
from sm.engine.util import GlobalInit
from sm.engine.postprocessing.cloudwatch import (
    get_perf_profile_start_finish_datetime,
    get_perf_profile_data,
    get_aws_lambda_request_ids,
    get_cloudwatch_logs,
    extract_data_from_cloudwatch_logs,
    calc_costs,
    add_cost_to_perf_profile_entries,
)

logger = logging.getLogger('engine')


def get_costs(
    cloudwatch_client: boto3.client, db: DB, log_groups: List[str], profile_id: int, time_delta: int
) -> Dict[int, float]:
    """Main function to calculate the cost per step for a given profile_id"""

    start_dt, finish_dt = get_perf_profile_start_finish_datetime(db, profile_id)
    if time_delta > 0:
        finish_dt += timedelta(seconds=time_delta)
    perf_profile_entries = get_perf_profile_data(db, profile_id)
    aws_lambda_request_ids = get_aws_lambda_request_ids(perf_profile_entries)
    cloudwatch_logs = get_cloudwatch_logs(
        cloudwatch_client, log_groups, start_dt, finish_dt, aws_lambda_request_ids, verbose=True
    )
    request_ids_stat = extract_data_from_cloudwatch_logs(cloudwatch_logs)
    costs = calc_costs(perf_profile_entries, request_ids_stat)

    return costs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update dataset processing costs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--profile-id', type=int, help='Profile ID')
    parser.add_argument('--time-delta', type=int, default=0, help='Time delta in seconds')
    parser.add_argument('--update-costs', type=bool, default=False, help='Update costs in Postgre')
    args = parser.parse_args()

    profile_id = args.profile_id

    with GlobalInit(config_path=args.config) as sm_config:
        db = DB()
        cw_client = boto3.client('logs')
        log_groups = sm_config['lithops']['aws_lambda']['cloudwatch_log_groups']

        costs_by_step = get_costs(cw_client, db, log_groups, profile_id, args.time_delta)
        logger.info(f'Total costs: ${round(sum(costs_by_step.values()), 4)}')

        if args.update_costs:
            logger.info('Updating costs ...')
            add_cost_to_perf_profile_entries(db, costs_by_step)
