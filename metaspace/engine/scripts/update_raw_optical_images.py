"""
This script provides a simple way to update raw optical images paths from storage to s3.
"""

import argparse
import logging
import os
import sys

import botocore
import pandas as pd
from botocore.exceptions import NoCredentialsError

from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.storage import get_s3_client
from sm.engine.util import GlobalInit

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger('engine')


def get_datasets(sql_where):
    """
    Selects datasets with optical images from the database
    """

    try:
        if sql_where:
            datasets_with_opt_img = DB().select(
                f"SELECT id, optical_image FROM "
                f"public.dataset WHERE optical_image is not null AND {sql_where} ORDER BY id"
            )
        else:
            datasets_with_opt_img = DB().select(
                "SELECT id, optical_image FROM public.dataset "
                "WHERE optical_image is not null ORDER BY id"
            )

        data = []
        for dataset in datasets_with_opt_img:
            ds_id, optical_image = dataset
            data.append({'ds_id': ds_id, 'uuid': optical_image})

        logger.info(f'Got {len(datasets_with_opt_img)} datasets')
        return data

    except botocore.exceptions.ClientError:
        logger.error("No datasets selected")
        return []


def check_s3_file(config, bucket_name, file_key):
    """
    Checks if optical image exists in s3
    """
    try:
        get_s3_client(sm_config=config).head_object(Bucket=bucket_name, Key=file_key)
        return True
    except botocore.exceptions.ClientError:
        return False


def check_storage_file(file_path):
    """
    Checks if optical image exists in storage
    """
    return os.path.exists(file_path)


def upload_to_s3(config, local_file, bucket, s3_file):
    """
    Clone optical image from storage and upload to s3
    """

    try:
        get_s3_client(sm_config=config).upload_file(local_file, bucket, s3_file)
        logger.info(f'Upload to s3 Successful: {s3_file}')
    except NoCredentialsError:
        logger.error("Credentials not available")
    except botocore.exceptions.ClientError:
        logger.error(f'Failed to upload to s3: {s3_file}')


def main():
    """
    List datasets with optical image according to the sql_where clause and update the path to s3
    """
    parser = argparse.ArgumentParser(
        description='Update raw optical images paths from storage to s3'
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "id = \'2023-01-01_09h51m24s\' AND status = \'FINISHED\' AND size_hash IS NULL"',
    )
    args = parser.parse_args()

    sm_config = SMConfig.get_conf()

    with GlobalInit(args.config_path):
        datasets = pd.DataFrame(get_datasets(sql_where=args.sql_where))
        if datasets.empty:
            logger.info('No datasets found')
            sys.exit(0)

    for _, row in datasets.iterrows():
        bucket = sm_config['image_storage']['raw_img_bucket']
        opt_img_s3_path = 'raw_optical/{}/{}'.format(row['ds_id'], row['uuid'])
        has_file_s3 = check_s3_file(sm_config, bucket, opt_img_s3_path)
        if not has_file_s3:
            file_path = '/opt/data/metaspace/public/raw_optical_images/{}/{}'.format(
                row['uuid'][0:3], row['uuid'][3:]
            )
            has_file_storage = check_storage_file(file_path)

            if has_file_storage:
                upload_to_s3(sm_config, file_path, bucket, opt_img_s3_path)
            else:
                logger.error(f'File does not exists on storage: {file_path}')


if __name__ == '__main__':
    main()
