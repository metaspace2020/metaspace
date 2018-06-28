import argparse
from os.path import abspath
import json
from logging.config import dictConfig

from sm.engine.util import sm_log_config, SMConfig
from sm.engine import ESIndexManager


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create ElasticSearch indices')
    parser.add_argument('--conf', default='conf/config.json', help="SM config path")
    parser.add_argument('--drop', action='store_true', help='Delete index if exists')
    args = parser.parse_args()

    dictConfig(sm_log_config)
    SMConfig.set_path(args.conf)

    es_config = SMConfig.get_conf()['elasticsearch']
    es_man = ESIndexManager(es_config)
    alias = es_config['index']
    index = es_man.internal_index_name(alias)

    if args.drop:
        es_man.delete_index(index)
    es_man.create_index(index)
    es_man.remap_alias(index, alias)
