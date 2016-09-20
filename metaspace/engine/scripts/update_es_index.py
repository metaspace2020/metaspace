import argparse
import json
from os.path import abspath

from sm.engine.util import sm_log_config, init_logger
from sm.engine.db import DB
from sm.engine.es_export import ESExporter


def reindex_results(ds_mask, conf):
    db = DB(conf['db'])
    es_exp = ESExporter(conf)

    if not ds_mask:
        es_exp.delete_index()
        es_exp.create_index()

    rows = db.select("select id from dataset where name like '{}%'".format(ds_mask))

    for row in rows:
        es_exp.index_ds(db, row[0])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reindex dataset results')
    parser.add_argument('--conf', default='conf/config.json', help="SM config path")
    parser.add_argument('--ds-name', dest='ds_name', default='', help="DS name mask")
    args = parser.parse_args()

    init_logger()

    with open(abspath(args.conf)) as f:
        reindex_results(args.ds_name, json.load(f))
