from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk, BulkIndexError
from elasticsearch.client import IndicesClient
import logging


logger = logging.getLogger('sm-engine')

COLUMNS = ["db_name", "ds_id", "ds_name", "sf", "comp_names", "comp_ids", "chaos", "image_corr", "pattern_match", "msm",
           "adduct", "job_id", "sf_id", "peaks", "db_id", "fdr", "mz", "ds_meta"]

RESULTS_TABLE_SQL = '''
SELECT
    sf_db.name AS db_name,
    ds.id as ds_id,
    ds.name AS ds_name,
    f.sf,
    f.names AS comp_names,
    f.subst_ids AS comp_ids,
    COALESCE(((m.stats -> 'chaos'::text)::text)::real, 0::real) AS chaos,
    COALESCE(((m.stats -> 'spatial'::text)::text)::real, 0::real) AS image_corr,
    COALESCE(((m.stats -> 'spectral'::text)::text)::real, 0::real) AS pattern_match,
    COALESCE(m.msm, 0::real) AS msm,
    m.adduct,
    j.id AS job_id,
    f.id AS sf_id,
    m.peaks_n AS peaks,
    sf_db.id AS db_id,
    m.fdr as pass_fdr,
    tp.centr_mzs[1] AS mz,
    ds.metadata as ds_meta
FROM iso_image_metrics m
JOIN formula_db sf_db ON sf_db.id = m.db_id
JOIN sum_formula f ON m.db_id = f.db_id AND f.id = m.sf_id
JOIN job j ON j.id = m.job_id
JOIN dataset ds ON ds.id = j.ds_id
JOIN theor_peaks tp ON tp.sf = f.sf AND tp.adduct = m.adduct
	AND tp.sigma::real = (ds.config->'isotope_generation'->>'isocalc_sigma')::real
	AND tp.charge = (CASE WHEN ds.config->'isotope_generation'->'charge'->>'polarity' = '+' THEN 1 ELSE -1 END)
	AND tp.pts_per_mz = (ds.config->'isotope_generation'->>'isocalc_pts_per_mz')::int
WHERE ds.id = %s
ORDER BY COALESCE(m.msm, 0::real) DESC
'''


class ESExporter:
    def __init__(self, sm_config):
        self.es = Elasticsearch(hosts=[{"host": sm_config['elasticsearch']['host']}])
        self.ind_client = IndicesClient(self.es)
        self.index = sm_config['elasticsearch']['index']

    def _index(self, annotations):
        to_index = []
        for r in annotations:
            d = dict(zip(COLUMNS, r))
            d['comp_names'] = u'|'.join(d['comp_names']).replace(u'"', u'')
            d['comp_ids'] = u'|'.join(d['comp_ids'])
            d['mz'] = '{:010.4f}'.format(d['mz']) if d['mz'] else ''

            to_index.append({
                '_index': self.index,
                '_type': 'annotation',
                '_id': '{}_{}_{}_{}'.format(d['ds_id'], d['db_name'], d['sf'], d['adduct']),
                '_source': d
            })

        bulk(self.es, actions=to_index, timeout='60s')

    def index_ds(self, db, ds_id):
        annotations = db.select(RESULTS_TABLE_SQL, ds_id)

        logger.info('Deleting {} documents from the index: {}'.format(len(annotations), ds_id))
        self.delete_ds(ds_id)

        logger.info('Indexing {} documents: {}'.format(len(annotations), ds_id))
        self._index(annotations)

    def delete_ds(self, ds_id):
        body = {
            "query": {
                "constant_score": {
                    "filter": {
                        "bool": {
                            "must": [
                                {"term": {"ds_id": ds_id}}
                            ]
                        }
                    }
                }
            }
        }
        res = self.es.search(index=self.index, body=body, _source=False, size=10**9)['hits']['hits']
        to_del = [{'_op_type': 'delete', '_index': 'sm', '_type': 'annotation', '_id': d['_id']} for d in res]

        del_n = 0
        try:
            del_n, _ = bulk(self.es, to_del, timeout='60s')
        except BulkIndexError as e:
            logger.warning('{} - {}'.format(e.args[0], e.args[1][1]))
        return del_n

    def create_index(self):
        body = {
            "settings": {
                "index": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                    "max_result_window": 2147483647,
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
            "mappings": {
                "annotation": {
                    # "dynamic_templates": [{
                    #     "notanalyzed": {
                    #         "match": "*",
                    #         "match_mapping_type": "string",
                    #         "mapping": {
                    #             "type": "string",
                    #             "index": "not_analyzed"
                    #         }
                    #     }
                    # }],
                    "properties": {
                        "db_name": {"type": "string", "index": "not_analyzed"},
                        "ds_id": {"type": "string", "index": "not_analyzed"},
                        "ds_name": {"type": "string", "index": "not_analyzed"},
                        "sf_adduct": {"type": "string", "index": "not_analyzed"},
                        "sf": {"type": "string", "index": "not_analyzed", "copy_to": "sf_adduct"},
                        "comp_names": {
                            "type": "string",
                            "analyzer": "analyzer_keyword",
                        },
                        "comp_ids": {"type": "string", "index": "not_analyzed"},
                        "chaos": {"type": "float", "index": "not_analyzed"},
                        "image_corr": {"type": "float", "index": "not_analyzed"},
                        "pattern_match": {"type": "float", "index": "not_analyzed"},
                        "msm": {"type": "float", "index": "not_analyzed"},
                        "adduct": {"type": "string", "index": "not_analyzed", "copy_to": "sf_adduct"},
                        "fdr": {"type": "float", "index": "not_analyzed"},
                        "mz": {"type": "string", "index": "not_analyzed"},
                        # dataset metadata
                        "ds_meta": {
                            "properties": {
                                "Submitted_By": {
                                    "properties": {
                                        "Submitter": {
                                            "properties": {
                                                "Email": {"type": "string", "index": "not_analyzed"}
                                            }
                                        },
                                        "Principal_Investigator": {
                                            "properties": {
                                                "Email": {"type": "string", "index": "not_analyzed"}
                                            }
                                        },
                                        "Institution": {"type": "string", "index": "not_analyzed"}
                                    }
                                },
                                "Sample_Preparation": {
                                    "properties": {
                                        "MALDI_Matrix": {"type": "string", "index": "not_analyzed"},
                                        "MALDI_Matrix_Application": {"type": "string", "index": "not_analyzed"}
                                    }
                                },
                                "Sample_Information": {
                                    "properties": {
                                        "Organism": {"type": "string", "index": "not_analyzed"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if not self.ind_client.exists(self.index):
            out = self.ind_client.create(index=self.index, body=body)
            logger.info('Index {} created\n{}'.format(self.index, out))
        else:
            logger.info('Index {} already exists'.format(self.index))

    def delete_index(self):
        if self.ind_client.exists(self.index):
            out = self.ind_client.delete(self.index)
            logger.info('Index {} deleted\n{}'.format(self.index, out))
