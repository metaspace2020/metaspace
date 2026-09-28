"""Unit tests for wait_for_storage / ensure_buckets in sm.engine.storage.

Fully mocked; no running S3 service is needed.
"""
from unittest.mock import MagicMock, patch

import botocore.exceptions
import pytest

from sm.engine.storage import ensure_buckets, wait_for_storage


def _client_error(status: int, code: str, operation: str = 'ListBuckets'):
    return botocore.exceptions.ClientError(
        {
            'Error': {'Code': code, 'Message': code},
            'ResponseMetadata': {'HTTPStatusCode': status},
        },
        operation,
    )


@patch('sm.engine.storage.time.sleep')
def test_wait_for_storage_returns_once_endpoint_answers(sleep):
    s3_client = MagicMock()
    s3_client.list_buckets.side_effect = [
        botocore.exceptions.EndpointConnectionError(endpoint_url='http://storage:9000'),
        {'Buckets': []},
    ]

    wait_for_storage(s3_client, timeout_sec=10, interval_sec=0.5)

    assert s3_client.list_buckets.call_count == 2
    sleep.assert_called_once_with(0.5)


@patch('sm.engine.storage.time.sleep')
def test_wait_for_storage_retries_on_5xx(sleep):
    s3_client = MagicMock()
    s3_client.list_buckets.side_effect = [_client_error(503, 'ServiceUnavailable'), {'Buckets': []}]

    wait_for_storage(s3_client, timeout_sec=10)

    assert s3_client.list_buckets.call_count == 2
    sleep.assert_called_once()


@patch('sm.engine.storage.time.sleep')
def test_wait_for_storage_reraises_4xx_immediately(sleep):
    s3_client = MagicMock()
    s3_client.list_buckets.side_effect = _client_error(403, 'InvalidAccessKeyId')

    with pytest.raises(botocore.exceptions.ClientError):
        wait_for_storage(s3_client, timeout_sec=10)

    sleep.assert_not_called()


@patch('sm.engine.storage.time.sleep')
@patch('sm.engine.storage.time.monotonic')
def test_wait_for_storage_raises_timeout_error(monotonic, _sleep):
    monotonic.side_effect = [0.0, 0.0, 61.0]
    s3_client = MagicMock()
    s3_client.list_buckets.side_effect = botocore.exceptions.EndpointConnectionError(
        endpoint_url='http://storage:9000'
    )

    with pytest.raises(TimeoutError, match='http://storage:9000'):
        wait_for_storage(s3_client, timeout_sec=60)


def test_ensure_buckets_creates_only_missing_buckets():
    s3_client = MagicMock()
    s3_client.meta.region_name = 'us-east-1'
    s3_client.head_bucket.side_effect = [None, _client_error(404, '404', 'HeadBucket')]

    ensure_buckets(['existing', 'missing'], s3_client)

    s3_client.create_bucket.assert_called_once_with(
        Bucket='missing', CreateBucketConfiguration={'LocationConstraint': 'us-east-1'}
    )
