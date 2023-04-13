import argparse
import time
import os
import subprocess
from pathlib import Path

import boto3


def get_datasets(path):
    data = {}
    with open(path) as f:
        for line in f.readlines():
            ds_id, input_path = line.strip().split('\t')
            bucket, key = input_path.replace('s3a://', '').split('/')
            data[ds_id] = {'bucket': bucket, 'key': key}
    return data


def download_file(bucket, key, filename):
    """Download a file from an S3 bucket"""
    s3 = boto3.client('s3')
    s3.download_file(bucket, key, filename)


def get_files_list(bucket, prefix):
    """Get a list of files in an S3 bucket"""
    s3 = boto3.client('s3')
    return s3.list_objects_v2(Bucket=bucket, Prefix=prefix)['Contents']


def calculate_total_size(data):
    total_size = 0
    for ds_id, info in data.items():
        files = get_files_list(info['bucket'], info['key'])
        for f in files:
            total_size += f['Size']

    print(f'Total size: {total_size/1024**3:6.1f} GB')


def download_files(data):
    for ds_id, info in data.items():
        files = get_files_list(info['bucket'], info['key'])
        print(f'Dataset ID: {ds_id}')
        data[ds_id] = {}
        for f in files:
            print(f'{f["Size"]/1024/1024:8.2f} MB\t{f["Key"]}')
            prefix, filename = f['Key'].split('/')
            extension = filename.split('.')[-1].lower()
            path = f'{prefix}/{filename}'
            data[ds_id][extension] = {
                'size': f['Size'],
                'name': filename,
                'prefix': prefix,
                'path': path,
            }

            Path(f'./{prefix}').mkdir(parents=True, exist_ok=True)
            download_file(info['bucket'], f['Key'], path)

    return data


def compress_files(data):
    compressions = {}
    compression_type = {'imzml': 'bzip2', 'ibd': '7z'}
    for ds_id, info in data.items():
        for extension, file in info.items():
            path = file['path']
            compressions[ds_id] = info
            t = compression_type[extension]
            cmd_str = f'7zzs a -t{t} -mx7 "{path}.{t}" "{path}"'
            start = time.time()
            subprocess.run(cmd_str, shell=True)
            end = time.time()
            compressions[ds_id][extension]['compression_size'] = os.path.getsize(f'{path}.{t}')
            compressions[ds_id][extension]['compression_time'] = round(end - start, 1)

            cmd_str = f'md5sum "{path}" > "{path}.md5"'
            subprocess.run(cmd_str, shell=True)

            print('Remove file')
            print(path)
            os.remove(path)
    return compressions


def print_compression_stats(compression):
    compression_type = {'imzml': 'bzip2', 'ibd': '7z'}
    size = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}
    time_ = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}
    for ds_id, info in compression.items():
        for ext, metadata in info.items():
            ct = compression_type[ext]
            s = f'{metadata["compression_size"]/metadata["size"]*100:7.2f}'
            t = f'{metadata["compression_time"]:8.1f}'
            size[ext][ct].append(metadata['compression_size'])
            time_[ext][ct].append(metadata['compression_time'])
            print(f'{ds_id}\t{ext:>5}\t{s}\t{t}')

    print('')
    print(f'  ibd\t{sum(size["ibd"]["7z"]):>14}\t{sum(time_["ibd"]["7z"]):8.1f}')
    print(f'imzml\t{sum(size["imzml"]["bzip2"]):>14}\t{sum(time_["imzml"]["bzip2"]):8.1f}')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Archiving imzML/ibd files from S3')
    parser.add_argument(
        '--datasets',
        dest='datasets',
        type=str,
        help='TSV file that stores ds_id and input_path of datasets',
    )
    parser.add_argument(
        '--calc-size',
        dest='calc_size',
        default=False,
        action='store_true',
        help='File size calculation',
    )
    args = parser.parse_args()

    files = get_datasets(args.datasets)
    calculate_total_size(files)
    if not args.calc_size:
        data = download_files(files)
        compression_metadata = compress_files(data)
        print_compression_stats(compression_metadata)
