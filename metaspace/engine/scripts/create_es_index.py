import argparse
from elasticsearch import Elasticsearch
from elasticsearch.client import IndicesClient


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create ElasticSearch indices')
    parser.add_argument('--host', type=str, help='ElasticSearch host IP address')

    args = parser.parse_args()

    ind_client = IndicesClient(Elasticsearch(hosts=[{'host': args.host}]))

    name = 'sm'
    if not ind_client.exists(name):
        body = {
            'settings': {
                "index": {
                    'max_result_window': 2147483647,
                    "analysis": {
                        "analyzer": {
                            "analyzer_keyword": {
                                "tokenizer": "keyword",
                                "filter": "lowercase"
                            }
                        }
                    }
                }
            },
            'mappings': {
                "annotation": {
                    "properties": {
                        "db_name": {"type": "string", "index": "not_analyzed"},
                        "ds_name": {"type": "string", "index": "not_analyzed"},
                        "sf": {"type": "string", "index": "not_analyzed"},
                        "comp_names": {
                            "type": "string",
                            "analyzer": "analyzer_keyword",
                        },
                        "comp_ids": {"type": "string", "index": "not_analyzed"},
                        "chaos": {"type": "float", "index": "not_analyzed"},
                        "image_corr": {"type": "float", "index": "not_analyzed"},
                        "pattern_match": {"type": "float", "index": "not_analyzed"},
                        "msm": {"type": "float", "index": "not_analyzed"},
                        "adduct": {"type": "string", "index": "not_analyzed"},
                        "fdr": {"type": "float", "index": "not_analyzed"}
                    }
                }
            }
        }
        out = ind_client.create(index=name, body=body)

        print 'Index {} created\n{}'.format(name, out)
    else:
        print 'Index {} already exists'.format(name)

