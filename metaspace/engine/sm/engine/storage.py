import time
from typing import Dict, Iterable

import boto3
import botocore.exceptions

from sm.engine.config import SMConfig


def _boto_client_kwargs(sm_config: Dict):
    boto_config = boto3.session.Config(signature_version='s3v4')
    if 'aws' in sm_config:
        return dict(
            region_name=sm_config['aws']['aws_default_region'],
            aws_access_key_id=sm_config['aws']['aws_access_key_id'],
            aws_secret_access_key=sm_config['aws']['aws_secret_access_key'],
            config=boto_config,
        )
    return dict(
        endpoint_url=sm_config['storage']['endpoint_url'],
        aws_access_key_id=sm_config['storage']['access_key_id'],
        aws_secret_access_key=sm_config['storage']['secret_access_key'],
        config=boto_config,
    )


def get_s3_client(sm_config: Dict = None):
    return boto3.client('s3', **_boto_client_kwargs(sm_config or SMConfig.get_conf()))


def get_s3_resource(sm_config: Dict = None):
    return boto3.resource('s3', **_boto_client_kwargs(sm_config or SMConfig.get_conf()))


def create_bucket(bucket_name: str, s3_client=None):
    try:
        s3_client.head_bucket(Bucket=bucket_name)
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == '404':
            s3_client.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={'LocationConstraint': s3_client.meta.region_name},
            )
        else:
            raise


def wait_for_storage(s3_client, timeout_sec: int = 60, interval_sec: float = 1.0):
    """Block until the S3 endpoint answers ListBuckets.

    RustFS (the dev/CI object store) accepts connections a few seconds after the
    container starts; MinIO was effectively instant. Connection errors and 5xx
    responses are retried until `timeout_sec`; 4xx responses (bad credentials,
    wrong endpoint) are raised immediately.
    """
    deadline = time.monotonic() + timeout_sec
    endpoint = s3_client.meta.endpoint_url
    last_error = None
    while True:
        try:
            s3_client.list_buckets()
            return
        except (botocore.exceptions.ConnectionError, botocore.exceptions.HTTPClientError) as e:
            last_error = e
        except botocore.exceptions.ClientError as e:
            if e.response['ResponseMetadata']['HTTPStatusCode'] < 500:
                raise
            last_error = e
        if time.monotonic() >= deadline:
            raise TimeoutError(
                f'S3 storage at {endpoint} not reachable after {timeout_sec}s: {last_error}'
            )
        time.sleep(interval_sec)


def ensure_buckets(bucket_names: Iterable[str], s3_client):
    """Create every bucket in `bucket_names` that does not exist yet (idempotent)."""
    for bucket_name in bucket_names:
        create_bucket(bucket_name, s3_client)


def get_s3_bucket(bucket_name: str, sm_config: Dict):
    return get_s3_resource(sm_config).Bucket(bucket_name)
