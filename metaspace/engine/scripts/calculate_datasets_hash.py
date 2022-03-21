import argparse
import hashlib
import logging
import time

import pandas as pd
from boto3 import client
import botocore

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)


def calc_hash(s3_object, chunk_size=1024 * 1024):
    """Calculate md5 and sha256 hash for an object chunk by chunk."""
    md5_hash = hashlib.md5()
    sha_hash = hashlib.sha256()
    chunk = s3_object.read(chunk_size)
    while chunk:
        md5_hash.update(chunk)
        sha_hash.update(chunk)
        chunk = s3_object.read(chunk_size)

    return {
        'md5': md5_hash.hexdigest(),
        'sha256': sha_hash.hexdigest(),
    }


def main():
    help_msg = 'Calculation of hash of ibd and imzml dataset files'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument(
        '--input-file', type=str, help='Name of CSV file that contains keys and version_ids'
    )
    parser.add_argument('--bucket', type=str, help='AWS upload bucket name')
    parser.add_argument('--output-file', default='./output.tsv', help='Output TSV file')
    args = parser.parse_args()

    conn = client('s3')

    data = []
    df = pd.read_csv(args.input_file, keep_default_na=False)
    for file in df.sort_values(by='Size').to_dict('records'):
        if file['Key'].startswith('databases'):
            continue
        filename = file['Key'].split('/')[-1]
        if filename.lower().endswith('ibd') or filename.lower().endswith('imzml'):
            try:
                resp = conn.get_object(
                    Bucket=args.bucket, Key=file['Key'], VersionId=file['VersionId']
                )
                start = time.time()
                item = {}
                item.update(calc_hash(resp['Body']))
                item.update({'calc_time': round(time.time() - start, 3)})
                item.update(
                    {
                        'size': file['Size'],
                        'version_id': file['VersionId'],
                        'key': file['Key'],
                    }
                )
                data.append(item)
                logging.info(
                    f'{item["md5"]} {item["sha256"]} {item["calc_time"]:>9.3f}\
                     {item["size"]} {item["version_id"]} {item["key"]}'
                )
            except botocore.exceptions.ClientError:
                logging.error(f'{file["Key"]}')

    df = pd.DataFrame.from_records(data)
    df.to_csv(args.output_file, index=False, sep='\t')


if __name__ == '__main__':
    main()
