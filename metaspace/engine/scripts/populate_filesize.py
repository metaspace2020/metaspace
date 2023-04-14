import argparse
import json
import logging

import boto3
import pandas as pd

from sm.engine.db import DB
from sm.engine.util import GlobalInit


def update_size_hash(df):

    db = DB()
    for i in df.iterrows():
        ds_id, _, imzml_size, ibd_size = i[1]
        try:
            size = {'imml_size': imzml_size, 'ibd_size': ibd_size}
            db.alter(
                'UPDATE public.dataset SET size_hash=%s WHERE id=%s',
                params=(
                    json.dumps(size),
                    ds_id,
                ),
            )
            logger.info(f'Updated size and hash for {ds_id}')
        except Exception:
            logger.error(f'Failed to update size and hash for {ds_id}', exc_info=True)


def get_datasets(sql_where):
    db = DB()

    try:
        datasets = db.select(
            f"SELECT id, input_path FROM public.dataset WHERE {sql_where} ORDER BY id"
        )

        data = []
        for dataset in datasets:
            ds_id, input_path = dataset
            _, key = input_path.replace('s3a://', '').split('/')
            data.append({'ds_id': ds_id, 'uuid': key})

        logger.info(f'Got {len(datasets)} datasets')
        return data

    except Exception:
        logger.error('Failed to get datasets', exc_info=True)
        return []


def get_all_files(bucket):
    s3 = boto3.client('s3')
    characters = '0123456789abcdef'

    prefixes = {}
    for prefix in [i + j for i in characters for j in characters]:
        result = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        if result.get('Contents'):
            for res in result['Contents']:
                uuid_prefix = res['Key'].split('/')[0]
                if len(uuid_prefix) == 36:
                    item = prefixes.get(uuid_prefix, {})
                    if res['Key'].lower().endswith('imzml'):
                        item['imzml'] = res['Size']
                    if res['Key'].lower().endswith('ibd'):
                        item['ibd'] = res['Size']
                    prefixes[uuid_prefix] = item

    for k, v in prefixes.items():
        if not v.get('imzml'):
            print('No imzml', k)
        if not v.get('ibd'):
            print('No ibd', k)

    return [
        {'uuid': k, 'imzml_size': v['imzml'], 'ibd_size': v['ibd']}
        for k, v in prefixes.items()
        if v.get('imzml') and v.get('ibd')
    ]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update size and hash sum for a provided datasets')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "status = \'FINISHED\' and ion_thumbnail is null"',
    )
    args = parser.parse_args()
    logger = logging.getLogger('engine')

    if args.sql_where:
        with GlobalInit(config_path='conf/config.json') as sm_config:
            datasets = pd.DataFrame(get_datasets(sql_where=args.sql_where))

        sizes = pd.DataFrame(get_all_files(bucket='sm-engine-upload'))

        df = pd.merge(datasets, sizes, on='uuid', how='left')
        df = df.drop(df[df.imzml_size.isna()].index)
        df['ibd_size'] = df['ibd_size'].astype('int64')
        df['imzml_size'] = df['imzml_size'].astype('int64')

        with GlobalInit(config_path='conf/config.json') as sm_config:
            update_size_hash(df)

    else:
        parser.print_help()
