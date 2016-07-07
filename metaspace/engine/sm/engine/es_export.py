import json
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan, bulk

from sm.engine.util import logger


COLUMNS = ["db_name", "ds_name", "sf", "comp_names", "comp_ids", "chaos", "image_corr", "pattern_match", "msm",
           "adduct", "job_id", "ds_id", "sf_id", "peaks", "db_id", "fdr"]

RESULTS_TABLE_SQL = '''SELECT sf_db.name AS db_name,
    ds.name AS ds_name,
    f.sf,
    f.names AS comp_names,
    f.subst_ids AS comp_ids,
    COALESCE(((m.stats -> 'chaos'::text)::text)::real, 0::real) AS chaos,
    COALESCE(((m.stats -> 'spatial'::text)::text)::real, 0::real) AS image_corr,
    COALESCE(((m.stats -> 'spectral'::text)::text)::real, 0::real) AS pattern_match,
    COALESCE(m.msm, 0::real) AS msm,
    a.adduct,
    j.id AS job_id,
    ds.id AS ds_id,
    f.id AS sf_id,
    m.peaks_n AS peaks,
    sf_db.id AS db_id,
    m.fdr as pass_fdr
FROM agg_formula f
CROSS JOIN adduct a
JOIN formula_db sf_db ON sf_db.id = f.db_id
LEFT JOIN job j ON j.id = a.job_id
LEFT JOIN dataset ds ON ds.id = j.ds_id
LEFT JOIN iso_image_metrics m ON m.job_id = j.id AND m.db_id = sf_db.id AND m.sf_id = f.id AND m.adduct = a.adduct
WHERE ds.name = %s AND sf_db.name = %s
ORDER BY COALESCE(m.msm, 0::real) DESC'''


class ESExporter:
    def __init__(self, sm_config):
        self.es = Elasticsearch(hosts=[{"host": sm_config['db']['host'], "port": 9200}])

    def _index(self, annotations):
        to_index = []
        for r in annotations:
            d = dict(zip(COLUMNS, r))
            d['comp_names'] = ','.join(d['comp_names']).replace('"', '')
            d['comp_ids'] = ','.join(d['comp_ids'])
            to_index.append( '{"index": {"_index" : "sm"}')
            to_index.append( json.dumps(d) )

        if len(to_index) > 1:
            self.es.bulk(body='\n'.join(to_index), index='sm', doc_type='annotation', timeout='60s')

    def _delete(self, name):
        query = {
            "query": {"term": {"ds_name": name}}
        }

        bulk_deletes = []
        for result in scan(self.es,
                           query=query,
                           index='sm',
                           doc_type='annotation',
                           _source=False,
                           track_scores=False,
                           scroll='5m'):
            result['_op_type'] = 'delete'
            bulk_deletes.append(result)

        bulk(self.es, bulk_deletes)

    def index_ds(self, db, ds_name, db_name):
        logger.info('Deleting documents from the index: {}-{}'.format(ds_name, db_name))
        self._delete(ds_name)

        logger.info('Indexing documents: {}-{}'.format(ds_name, db_name))
        self._index(db.select(RESULTS_TABLE_SQL, ds_name, db_name))
