import json
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan, bulk, BulkIndexError

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
        self.es = Elasticsearch(hosts=[{"host": sm_config['elasticsearch']['host']}])

    def _index(self, annotations):
        to_index = []
        for r in annotations:
            d = dict(zip(COLUMNS, r))
            d['comp_names'] = u','.join(d['comp_names']).replace(u'"', u'')
            d['comp_ids'] = u','.join(d['comp_ids'])

            to_index.append({
                '_index': 'sm',
                '_type': 'annotation',
                '_id': '{}_{}_{}_{}'.format(d['ds_id'], d['db_id'], d['sf'], d['adduct']),
                '_source': d
            })

        bulk(self.es, actions=to_index, timeout='60s')

    def _delete(self, annotations):
        to_delete = []
        for r in annotations:
            d = dict(zip(COLUMNS, r))
            to_delete.append({
                '_op_type': 'delete',
                '_index': 'sm',
                '_type': 'annotation',
                '_id': '{}_{}_{}_{}'.format(d['ds_id'], d['db_id'], d['sf'], d['adduct']),
            })

        bulk(self.es, to_delete)

    def index_ds(self, db, ds_name, db_name):
        annotations = db.select(RESULTS_TABLE_SQL, ds_name, db_name)

        logger.info('Deleting documents from the index: {}-{}'.format(ds_name, db_name))
        self._delete(annotations)

        logger.info('Indexing documents: {}-{}'.format(ds_name, db_name))
        self._index(annotations)
