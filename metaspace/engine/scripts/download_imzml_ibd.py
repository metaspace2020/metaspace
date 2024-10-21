import argparse
import logging
import time
from typing import Any, Dict
import os
import subprocess
import sys
from pathlib import Path

import boto3

from sm.engine.util import GlobalInit
from sm.engine.db import DB

logger = logging.getLogger('engine')


def dir_path(path):
    if os.path.isdir(path):
        return path
    else:
        raise argparse.ArgumentTypeError(f'readable_dir:{path} is not a valid path')


def extract_bucket_key(datasets: Dict[str, str]) -> Dict[str, Dict[str, str]]:
    data = {}
    for input_path, ds_id in datasets.items():
        bucket, key = input_path.replace('s3a://', '').split('/')
        data[ds_id] = {'bucket': bucket, 'key': key}

    return dict(sorted(data.items()))


def get_datasets_from_db(sql_where: str) -> Dict[str, Dict[str, str]]:
    db = DB()
    datasets = {
        input_path: id
        for (id, input_path,) in db.select(
            f'SELECT DISTINCT ON (input_path) id, input_path FROM dataset WHERE {sql_where}'
        )
    }

    return extract_bucket_key(datasets)


def get_datasets_from_file(file) -> Dict[str, Dict[str, str]]:
    with open(file) as f:
        datasets = {}
        # return only unique input_path (no duplicates) to avoid downloading files again
        for line in f.readlines():
            ds_id, input_path = line.strip().split('\t')
            datasets[input_path] = ds_id

    return extract_bucket_key(datasets)


def calculate_total_size(
    client: boto3.client, data: Dict[str, Dict[str, str]], logger: logging
) -> None:
    total_size = 0
    for _, info in data.items():
        files = client.list_objects_v2(Bucket=info['bucket'], Prefix=info['key'])['Contents']
        for f in files:
            total_size += f['Size']

    logger.info(f'Total size: {total_size/1024**3:6.1f} GB')


def print_compression_stats(ds_id: str, info: Dict[str, Dict[str, Any]]) -> None:
    compression_type = {'imzml': 'bzip2', 'ibd': '7z'}
    sizes = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}
    times = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}

    for ext, metadata in info.items():
        com_alg = compression_type[ext]
        size = f'{metadata["compression_size"]/metadata["size"]*100:7.2f}'
        time_ = f'{metadata["compression_time"]:8.1f}'
        sizes[ext][com_alg].append(metadata['compression_size'])
        times[ext][com_alg].append(metadata['compression_time'])
        logger.info(f'{ds_id}\t{ext:>5}\t{size}\t{time_}')


def download_files(
    client: boto3.client, ds_id: str, info: Dict[str, str], output_path: str
) -> Dict[str, Dict[str, str]]:
    metadata = {}
    files = client.list_objects_v2(Bucket=info['bucket'], Prefix=info['key'])['Contents']
    for f in files:
        prefix, filename = f['Key'].split('/')
        extension = filename.split('.')[-1].lower()
        path = Path(output_path, prefix, filename)
        metadata[extension] = {
            'size': f['Size'],
            'name': filename,
            'prefix': prefix,
            'path': str(path),
        }
        logger.info(f'{ds_id}\t{prefix}\t{extension:>5}\t{f["Size"]/1024/1024:8.1f} MB')

        Path(output_path, prefix).mkdir(parents=True, exist_ok=True)
        client.download_file(info['bucket'], f['Key'], path)

    return metadata


def compress_files(info):
    compression_types = {'imzml': 'bzip2', 'ibd': '7z'}

    compressions = {}
    for extension, file in info.items():
        path = file['path']
        compressions = info
        com_alg = compression_types[extension]
        cmd_str = f'7zzs a -t{com_alg} -mx7 "{path}.{com_alg}" "{path}" > /dev/null'
        start = time.time()
        subprocess.run(cmd_str, shell=True, check=True)
        end = time.time()
        compressions[extension]['compression_size'] = os.path.getsize(f'{path}.{com_alg}')
        compressions[extension]['compression_time'] = round(end - start, 1)

        cmd_str = f'md5sum "{path}" > "{path}.md5"'
        subprocess.run(cmd_str, shell=True, check=True)

        os.remove(path)
    return compressions


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Archiving imzML/ibd files from S3')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "id LIKE \'2024-01-01%%\'"',
    )
    parser.add_argument(
        '--datasets-file',
        dest='datasets_file',
        default=None,
        type=argparse.FileType('r'),
        help='TSV file that stores ds_id and input_path of datasets',
    )
    parser.add_argument(
        '--output-path',
        dest='output_path',
        type=dir_path,
        help='The path to the folder where the directories for the archived files will be created'
    )

    args = parser.parse_args()

    # check if all arguments is not initialized
    if not bool(args.datasets_file) ^ bool(args.sql_where):
        parser.print_usage()
        print('Error: must specify either --datasets-file, --sql-where or --past-day')
        sys.exit(1)

    # check if two argument is initialized
    if bool(args.datasets_file) & bool(args.sql_where):
        parser.print_usage()
        print(
            'Error: must specify only one argument either --datasets-file, --sql-where'
        )
        sys.exit(1)

    sql_where = args.sql_where if args.sql_where else None

    s3_client = boto3.client('s3')
    with GlobalInit(config_path=args.config) as sm_config:
        datasets = {}
        if args.datasets_file:
            datasets = get_datasets_from_file(args.datasets_file)
        elif sql_where:
            datasets = get_datasets_from_db(sql_where)

        calculate_total_size(s3_client, datasets, logger)
        for ds_id, info in datasets.items():
            files_metadata = download_files(s3_client, ds_id, info, args.output_path)
            compression_metadata = compress_files(files_metadata)
            print_compression_stats(ds_id, compression_metadata)
