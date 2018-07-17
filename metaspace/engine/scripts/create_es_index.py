import argparse

from sm.engine.util import SMConfig, init_loggers
from sm.engine.es_export import ESIndexManager


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create ElasticSearch indices')
    parser.add_argument('--config', dest='config_path', default='conf/config.json', help='SM config path')
    parser.add_argument('--drop', action='store_true', help='Delete index if exists')
    args = parser.parse_args()

    SMConfig.set_path(args.config_path)
    init_loggers(SMConfig.get_conf()['logs'])

    es_config = SMConfig.get_conf()['elasticsearch']
    es_man = ESIndexManager(es_config)
    alias = es_config['index']
    index = es_man.internal_index_name(alias)

    if args.drop:
        es_man.delete_index(index)
    es_man.create_index(index)
    es_man.remap_alias(index, alias)
