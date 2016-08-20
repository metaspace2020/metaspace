import argparse
import json
from os.path import abspath
from logging.config import dictConfig

from sm.engine.util import sm_log_config
from sm.engine.db import DB
from sm.engine.es_export import ESExporter


def reindex_all_results(conf):
    db = DB(conf['db'])
    es_exp = ESExporter(conf)

    es_exp.delete_index()
    es_exp.create_index()

    rows = db.select("select id from dataset")

    for row in rows:
        es_exp.index_ds(db, row[0])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex all dataset results')
    parser.add_argument('--conf', default='conf/config.json', help="SM config path")
    args = parser.parse_args()

    dictConfig(sm_log_config)

    with open(abspath(args.conf)) as f:
        reindex_all_results(json.load(f))
