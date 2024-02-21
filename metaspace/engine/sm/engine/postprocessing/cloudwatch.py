import re
import json
import time
import logging
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from datetime import datetime, timedelta

import boto3
import numpy as np

from sm.engine.db import DB

EC2_PRICE = {
    32768: 0.2538,
    65536: 0.5076,
    131072: 1.0152,
    262144: 2.0304,
}

PERF_PROFILE = 'SELECT start, finish FROM perf_profile WHERE id = %s'


PERF_PROFILE_ENTRY = (
    'SELECT id, name, start, finish, extra_data '
    'FROM perf_profile_entry'
    'WHERE profile_id = %s'
    'ORDER BY id'
)

logger = logging.getLogger('engine')


def get_perf_profile_start_finish_datetime(
        db: DB, profile_id: int
) -> Optional[Tuple[datetime, datetime]]:
    resp = db.select_with_fields(PERF_PROFILE, params=(profile_id,))
    if resp and isinstance(resp[0].get('finish'), datetime):
        return resp[0]['start'], resp[0]['finish']
    return None


def get_perf_profile_data(db: DB, profile_id: int) -> Optional[List[Dict[str, Any]]]:
    resp = db.select_with_fields(PERF_PROFILE_ENTRY,params=(profile_id,))
    if resp:
        return resp
    return None


def get_aws_lambda_request_ids(perf_profile_entries: List[Dict[str, Any]]) -> Set[str]:
    """Return back AWS Lambda request ID for all runs"""
    request_ids = []
    for entry in perf_profile_entries:
        if entry['extra_data']['runtime_memory'] <= 10 * 1024:
            request_ids.extend(entry['extra_data']['request_ids'])
    return set(request_ids)


def get_raw_cloudwatch_logs(
        cw_client: boto3.client, log_groups: List[str], start_dt: datetime, finish_dt: datetime
) -> Dict[str, Any]:
    """Return back response from Cloudwatch client"""

    query = ('fields @timestamp, @message | filter @message like /REPORT RequestId/ | '
             'sort @timestamp desc | limit 10000')
    delta = 15  # extend the endTime 15 minutes to cover stuck lambda function

    start_query_response = cw_client.start_query(
        logGroupNames=log_groups,
        startTime=int((start_dt).timestamp()),
        endTime=int((finish_dt + timedelta(minutes=delta)).timestamp()),
        queryString=query,
    )

    query_id = start_query_response['queryId']
    response = None

    while response is None or response['status'] == 'Running':  # pylint: disable=unsubscriptable-object
        time.sleep(5.0)
        response = cw_client.get_query_results(queryId=query_id)

    return response


def get_cloudwatch_logs(
        cw_client: boto3.client,
        log_groups: list,
        start_dt: datetime,
        finish_dt: datetime,
        aws_lambda_request_ids: Set[str]
) -> List[List[Dict[str, str]]]:
    """Return back Cloudwatch Logs during job execution"""

    logger.info(f'Number of runs: {len(aws_lambda_request_ids)}')
    response = get_raw_cloudwatch_logs(cw_client, log_groups, start_dt, finish_dt)
    cloudwatch_request_ids = set(extract_data_from_cloudwatch_logs(response['results']).keys())
    # AWS Lambda logs are typically available in Cloudwatch Logs with a delay of several minutes
    # we repeat requests to Cloudwatch until all request_ids that are present
    # in the perf_profile_entries table are also available in Cloudwatch Logs
    while len(aws_lambda_request_ids - cloudwatch_request_ids) > 0:
        waiting_request_ids = aws_lambda_request_ids - cloudwatch_request_ids
        logger.info(f'Waiting {len(waiting_request_ids):>3} CloudWatch records')
        if len(waiting_request_ids) == 1:
            logger.info(waiting_request_ids)
        time.sleep(25)
        response = get_raw_cloudwatch_logs(cw_client, log_groups, start_dt, finish_dt)
        cloudwatch_request_ids = set(extract_data_from_cloudwatch_logs(response['results']).keys())

    if int(response['statistics']['recordsMatched']) >= 10_000:
        logger.warning('Found more 10_000 matched records in Cloudwatch logs')

    return response['results']


def extract_value(message: str) -> Dict[str, Union[float, int]]:
    """Extract info about duration time in seconds and usage memory in MB"""

    if re.match('^Billed Duration', message):
        return {'duration_billed': round(float(message.split(' ')[2]) / 1000.0, 3)}
    elif re.match('^Init Duration', message):
        return {'duration_init': round(float(message.split(' ')[2]) / 1000.0, 3)}
    elif re.match('^Duration', message):
        return {'duration_exec': round(float(message.split(' ')[1]) / 1000.0, 3)}

    if re.match('^Max Memory Used', message):
        return {'memory_used': int(message.split(' ')[3])}

    return {}


def extract_data_from_cloudwatch_logs(
        records: List[List[Dict[str, str]]]
) -> Dict[str, Dict[str, Union[float, int]]]:
    """For each record in CW logs, extract info about Duration and Memory"""
    data = {}
    for record in records:
        messages = record[1]['value'].split('\t')
        request_id = messages[0].split(' ')[2]

        item = {}
        # iterate over report values: Duration, Memory, ...
        for m in messages:
            values = extract_value(m)
            if values:
                item.update(extract_value(m))

        data[request_id] = item

    return data


def _calc_lambda_cost(gb_secs, actions) -> float:
    cost = 16.67 * 10 ** (-6) * gb_secs
    cost += 0.20 * 10 ** (-6) * actions
    return round(cost, 8)


def _calc_ec2_cost(runtime_memory, total_time) -> float:
    # when runtime_memory equal 16 or 32 GB we use a VM with 32 GB RAM
    memory = runtime_memory if runtime_memory >= 32768 else 32768

    price_per_hour = EC2_PRICE[memory]
    total_cost = price_per_hour * total_time / 3600.0
    return round(total_cost, 8)


def calc_costs(perf_profile_entries, request_ids_stat) -> Dict[int, float]:
    """Calculate costs for each step of the pipeline (perf_profile_entry)"""
    costs = {}
    for entry in perf_profile_entries:
        extra_data = entry['extra_data']
        runtime_memory = extra_data['runtime_memory']

        if runtime_memory > 10 * 1024:  # EC2 instance
            total_time = (entry['finish'] - entry['start']).total_seconds()
            total_cost = _calc_ec2_cost(runtime_memory, total_time)
        else:
            time_total_aws = [
                request_ids_stat[r_id].get('duration_billed', 0.0)
                for r_id in extra_data['request_ids']
            ]
            total_gb_sec = np.sum(np.array(time_total_aws) * runtime_memory / 1024)
            total_cost = _calc_lambda_cost(
                total_gb_sec, extra_data.get('num_actions', len(extra_data['request_ids']))
            )

        costs[entry['id']] = total_cost
        logger.info(f'{entry["id"]}: {100*total_cost:5.3f}¢ {entry["name"]}')

    return costs


def get_costs(
        cloudwatch_client: boto3.client, db: DB, log_groups: List[str], profile_id: int
) -> Dict[int, float]:
    """Main function to calculate the cost per step for a given profile_id"""

    start_dt, finish_dt = get_perf_profile_start_finish_datetime(db, profile_id)
    perf_profile_entries = get_perf_profile_data(db, profile_id)
    aws_lambda_request_ids = get_aws_lambda_request_ids(perf_profile_entries)
    cloudwatch_logs = get_cloudwatch_logs(
        cloudwatch_client, log_groups, start_dt, finish_dt, aws_lambda_request_ids
    )
    request_ids_stat = extract_data_from_cloudwatch_logs(cloudwatch_logs)
    costs = calc_costs(perf_profile_entries, request_ids_stat)

    return costs


def add_cost_to_perf_profile_entries(db: DB, cost_data: Dict[int, float]) -> None:
    """Add info about costs to perf_profile_entries table"""
    for perf_profile_entry_id, cost in cost_data.items():
        (old_extra_data,) = db.select_one(
            'SELECT extra_data FROM perf_profile_entry WHERE id = %s',
            (perf_profile_entry_id,),
        )
        extra_data_json = json.dumps({**(old_extra_data or {}), **{'cost': cost}})
        db.alter(
            'UPDATE perf_profile_entry SET extra_data = %s WHERE id = %s',
            (extra_data_json, perf_profile_entry_id),
        )
