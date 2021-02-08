import boto3
from sm.engine.util import SMConfig


def _boto_client_kwargs():
    config = SMConfig.get_conf()
    return dict(
        endpoint_url=config['storage']['endpoint_url'],
        aws_access_key_id=config['storage']['access_key_id'],
        aws_secret_access_key=config['storage']['secret_access_key'],
        region_name=config['aws']['aws_default_region'],
        config=boto3.session.Config(signature_version='s3v4'),
    )


def get_s3_client():
    return boto3.client('s3', **_boto_client_kwargs())


def get_s3_bucket(bucket_name):
    return boto3.resource('s3', **_boto_client_kwargs()).Bucket(bucket_name)
