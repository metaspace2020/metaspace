import argparse
import json
from os.path import abspath
import psycopg2
psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)

from sm.engine.db import DB
from sm.engine.es_export import ESExporter


def reindex_all_results(conf):
    db = DB(conf['db'])
    es_exp = ESExporter(conf)

    es_exp.delete_index(name='sm')
    es_exp.create_index(name='sm')

    ds_db_pairs = db.select("select name, config -> 'database'::text -> 'name'::text from dataset")

    for ds_name, db_name in ds_db_pairs:
        es_exp.index_ds(db, ds_name, db_name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex all dataset results')
    parser.add_argument('--conf', default='conf/config.json', help="SM config path")
    args = parser.parse_args()

    with open(abspath(args.conf)) as f:
        reindex_all_results(json.load(f))
