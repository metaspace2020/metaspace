import boto3
from sm.engine.util import SMConfig

def get_boto3_s3_client():
    config = SMConfig.get_conf()
    return boto3.client('s3',
        endpoint_url=config['storage']['endpoint_url'],
        aws_access_key_id=config['aws']['aws_access_key_id'],
        aws_secret_access_key=config['aws']['aws_secret_access_key'],
        region_name=config['aws']['aws_default_region'],
    )

def get_boto3_s3_bucket(bucket_name):
    config = SMConfig.get_conf()
    session = boto3.session.Session()
    return session.resource('s3',
        endpoint_url=config['storage']['endpoint_url'],
        aws_access_key_id=config['aws']['aws_access_key_id'],
        aws_secret_access_key=config['aws']['aws_secret_access_key'],
        region_name=config['aws']['aws_default_region'],
    ).Bucket(bucket_name)
