import argparse
import time
import os
import subprocess
from pathlib import Path

import boto3


def get_datasets(path):
    with open(path) as f:
        data = {}
        # return only unique input_path (no duplicates) to avoid downloading files again
        for line in f.readlines():
            ds_id, input_path = line.strip().split('\t')
            data[input_path] = ds_id

    datasets = {}
    for input_path, ds_id in data.items():
        bucket, key = input_path.replace('s3a://', '').split('/')
        datasets[ds_id] = {'bucket': bucket, 'key': key}

    return dict(sorted(datasets.items()))


def calculate_total_size(client, data):
    total_size = 0
    for _, info in data.items():
        files = client.list_objects_v2(Bucket=info['bucket'], Prefix=info['key'])['Contents']
        for f in files:
            total_size += f['Size']

    print(f'Total size: {total_size/1024**3:6.1f} GB')


def download_files(client, ds_id, info):
    print(f'Dataset ID: {ds_id}')
    files = client.list_objects_v2(Bucket=info['bucket'], Prefix=info['key'])['Contents']

    metadata = {}
    for f in files:
        print(f'{f["Size"]/1024/1024:8.2f} MB\t{f["Key"]}')
        prefix, filename = f['Key'].split('/')
        extension = filename.split('.')[-1].lower()
        path = f'{prefix}/{filename}'
        metadata[extension] = {
            'size': f['Size'],
            'name': filename,
            'prefix': prefix,
            'path': path,
        }

        Path(f'./{prefix}').mkdir(parents=True, exist_ok=True)
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


def print_compression_stats(ds_id, info):
    compression_type = {'imzml': 'bzip2', 'ibd': '7z'}
    sizes = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}
    times = {'imzml': {'bzip2': []}, 'ibd': {'7z': []}}

    for ext, metadata in info.items():
        com_alg = compression_type[ext]
        size = f'{metadata["compression_size"]/metadata["size"]*100:7.2f}'
        time_ = f'{metadata["compression_time"]:8.1f}'
        sizes[ext][com_alg].append(metadata['compression_size'])
        times[ext][com_alg].append(metadata['compression_time'])
        print(f'{ds_id}\t{ext:>5}\t{size}\t{time_}')


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
    client = boto3.client('s3')
    calculate_total_size(client, files)
    if not args.calc_size:
        for ds_id, info in files.items():
            files_metadata = download_files(client, ds_id, info)
            compression_metadata = compress_files(files_metadata)
            print_compression_stats(ds_id, compression_metadata)
