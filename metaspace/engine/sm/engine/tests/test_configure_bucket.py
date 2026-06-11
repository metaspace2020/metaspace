"""Unit tests for configure_bucket in sm.engine.image_storage.

These tests are fully mocked and do not require a running S3/MinIO service.
"""
from unittest.mock import MagicMock, patch

from sm.engine import image_storage


@patch('sm.engine.image_storage.create_bucket')
@patch('sm.engine.image_storage.get_s3_client')
def test_configure_bucket_skips_public_policy_on_aws(get_s3_client, _create_bucket):
    s3_client = MagicMock()
    get_s3_client.return_value = s3_client
    sm_config = {'aws': {'aws_default_region': 'eu-west-1'}, 'image_storage': {'bucket': 'b'}}

    image_storage.configure_bucket(sm_config)

    s3_client.put_bucket_policy.assert_not_called()


@patch('sm.engine.image_storage.create_bucket')
@patch('sm.engine.image_storage.get_s3_client')
def test_configure_bucket_sets_public_policy_on_minio(get_s3_client, _create_bucket):
    s3_client = MagicMock()
    get_s3_client.return_value = s3_client
    sm_config = {'storage': {'endpoint_url': 'http://minio:9000'}, 'image_storage': {'bucket': 'b'}}

    image_storage.configure_bucket(sm_config)

    s3_client.put_bucket_policy.assert_called_once()
