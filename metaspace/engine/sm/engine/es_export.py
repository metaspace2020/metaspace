from elasticsearch import Elasticsearch, NotFoundError
from elasticsearch.helpers import bulk, BulkIndexError
from elasticsearch.client import IndicesClient
import logging
from collections import defaultdict

from sm.engine.util import SMConfig
from sm.engine.db import DB

logger = logging.getLogger('sm-engine')

COLUMNS = ["ds_id", "ds_name", "sf", "sf_adduct",
           "chaos", "image_corr", "pattern_match", "total_iso_ints", "min_iso_ints", "max_iso_ints", "msm",
           "adduct", "job_id", "sf_id", "fdr",
           "centroid_mzs", "ds_config", "ds_meta", "iso_image_ids", "polarity"]

ANNOTATIONS_SEL = '''
SELECT
    ds.id as ds_id,
    ds.name AS ds_name,
    f.sf,
    CONCAT(f.sf, m.adduct) as sf_adduct,
    --f.names AS comp_names,
    --f.subst_ids AS comp_ids,
    COALESCE(((m.stats -> 'chaos'::text)::text)::real, 0::real) AS chaos,
    COALESCE(((m.stats -> 'spatial'::text)::text)::real, 0::real) AS image_corr,
    COALESCE(((m.stats -> 'spectral'::text)::text)::real, 0::real) AS pattern_match,
    (m.stats -> 'total_iso_ints'::text) AS total_iso_ints,
    (m.stats -> 'min_iso_ints'::text) AS min_iso_ints,
    (m.stats -> 'max_iso_ints'::text) AS max_iso_ints,
    COALESCE(m.msm, 0::real) AS msm,
    m.adduct,
    j.id AS job_id,
    f.id AS sf_id,
    m.fdr as pass_fdr,
    tp.centr_mzs AS centroid_mzs,
    ds.config as ds_config,
    ds.metadata as ds_meta,
    m.iso_image_urls as iso_image_ids,
    ds.config->'isotope_generation'->'charge'->'polarity' as polarity
FROM iso_image_metrics m
JOIN sum_formula f ON f.id = m.sf_id
JOIN job j ON j.id = m.job_id
JOIN dataset ds ON ds.id = j.ds_id
JOIN theor_peaks tp ON tp.sf = f.sf AND tp.adduct = m.adduct
	AND tp.sigma::real = (ds.config->'isotope_generation'->>'isocalc_sigma')::real
	AND tp.charge = (CASE WHEN ds.config->'isotope_generation'->'charge'->>'polarity' = '+' THEN 1 ELSE -1 END)
	AND tp.pts_per_mz = (ds.config->'isotope_generation'->>'isocalc_pts_per_mz')::int
WHERE ds.id = %s AND m.db_id = %s
ORDER BY COALESCE(m.msm, 0::real) DESC
'''

DATASET_SEL = '''SELECT
    dataset.id,
    name,
    config,
    metadata,
    input_path,
    dataset.status,
    to_char(max(finish), 'YYYY-MM-DD HH:MI:SS')
FROM dataset LEFT JOIN job ON job.ds_id = dataset.id
WHERE dataset.id = %s
GROUP BY dataset.id
'''

DATASET_COLUMNS = ('ds_id', 'ds_name', 'ds_config', 'ds_meta', 'ds_input_path', 'ds_status', 'ds_last_finished')

def init_es_conn(es_config):
    hosts = [{"host": es_config['host'], "port": int(es_config['port'])}]
    http_auth = (es_config['user'], es_config['password']) if 'user' in es_config else None
    return Elasticsearch(hosts=hosts, http_auth=http_auth)


class ESIndexManager(object):
    def __init__(self, es_config=None):
        if not es_config:
            es_config = SMConfig.get_conf()['elasticsearch']
        self._es = init_es_conn(es_config)
        self._ind_client = IndicesClient(self._es)

    def internal_index_name(self, alias):
        yin, yang = '{}-yin'.format(alias), '{}-yang'.format(alias)
        assert not (self.exists_index(yin) and self.exists_index(yang)), \
            'Only one of {} and {} should exist'.format(yin, yang)

        if self.exists_index(yin):
            return yin
        elif self.exists_index(yang):
            return yang
        else:
            return yin

    def create_index(self, index):
        dynamic_templates = [{
            "strings": {
                "match_mapping_type": "string",
                    "mapping": {
                        "type": "keyword"}}
        }]
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
                                "filter": "lowercase"}}}}},
            "mappings": {
                "dataset": {
                    "dynamic_templates": dynamic_templates,
                    "properties": {
                        "ds_id": {"type": "keyword"}
                    }
                },
                "annotation": {
                    "dynamic_templates": dynamic_templates,
                    "properties": {
                        "ds_id": {"type": "keyword"},
                        "comp_names": {
                            "type": "text",
                            "analyzer": "analyzer_keyword"},
                        "chaos": {"type": "float"},
                        "image_corr": {"type": "float"},
                        "pattern_match": {"type": "float"},
                        "total_iso_ints": {"type": "float"},
                        "min_iso_ints": {"type": "float"},
                        "max_iso_ints": {"type": "float"},
                        "msm": {"type": "float"},
                        "fdr": {"type": "float"}}}}}

        if not self._ind_client.exists(index):
            out = self._ind_client.create(index=index, body=body)
            logger.info('Index {} created\n{}'.format(index, out))
        else:
            logger.info('Index {} already exists'.format(index))

    def delete_index(self, index):
        if self._ind_client.exists(index):
            out = self._ind_client.delete(index)
            logger.info('Index {} deleted: {}'.format(index, out))

    def exists_index(self, index):
        return self._ind_client.exists(index)

    def another_index_name(self, index):
        assert index.endswith('yin') or index.endswith('yang')

        if index.endswith('yin'):
            return index.replace('yin', 'yang')
        else:
            return index.replace('yang', 'yin')

    def remap_alias(self, new_index, alias='sm'):
        old_index = self.another_index_name(new_index)
        logger.info('Remapping {} alias: {} -> {}'.format(alias, old_index, new_index))

        self._ind_client.update_aliases({
            "actions": [{"add": {"index": new_index, "alias": alias}}]
        })
        if self._ind_client.exists_alias(old_index, alias):
            self._ind_client.update_aliases({
                "actions": [{"remove": {"index": old_index, "alias": alias}}]
            })
            out = self._ind_client.delete(index=old_index)
            logger.info('Index {} deleted: {}'.format(old_index, out))


class ESExporter(object):
    def __init__(self, db, es_config=None):
        if not es_config:
            es_config = SMConfig.get_conf()['elasticsearch']
        self._es = init_es_conn(es_config)
        self._db = db
        self.index = es_config['index']

    def _remove_mol_db_from_dataset(self, ds_id, mol_db):
        dataset = self._es.get_source(self.index, id=ds_id, doc_type='dataset')
        dataset['annotation_counts'] = \
            [entry for entry in dataset.get('annotation_counts', [])
                   if not (entry['db']['name'] == mol_db.name and
                           entry['db']['version'] == mol_db.version)]
        self._es.update(self.index, id=ds_id, body={'doc': dataset}, doc_type='dataset')
        return dataset

    def sync_dataset(self, ds_id):
        dataset = dict(zip(DATASET_COLUMNS, self._db.select(DATASET_SEL, ds_id)[0]))
        if self._es.exists(index=self.index, doc_type='dataset', id=ds_id):
            self._es.update(index=self.index, id=ds_id, doc_type='dataset', body={'doc': dataset})
        else:
            self._es.index(index=self.index, id=ds_id, doc_type='dataset', body=dataset)

    def index_ds(self, ds_id, mol_db, del_first=False):
        if del_first:
            self.delete_ds(ds_id, mol_db)

        try:
            dataset = self._remove_mol_db_from_dataset(ds_id, mol_db)
        except NotFoundError:
            dataset = dict(zip(DATASET_COLUMNS, self._db.select(DATASET_SEL, ds_id)[0]))
        if 'annotation_counts' not in dataset:
            dataset['annotation_counts'] = []

        annotation_counts = defaultdict(int)
        fdr_levels = [5, 10, 20, 50]

        annotations = self._db.select(ANNOTATIONS_SEL, ds_id, mol_db.id)
        logger.info('Indexing {} documents: {}'.format(len(annotations), ds_id))

        n = 100
        to_index = []
        for r in annotations:
            d = dict(zip(COLUMNS, r))
            df = mol_db.get_molecules(d['sf'])
            d['db_name'] = mol_db.name
            d['db_version'] = mol_db.version
            d['comp_ids'] = df.mol_id.values.tolist()[:50]  # to prevent ES 413 Request Entity Too Large error
            d['comp_names'] = df.mol_name.values.tolist()[:50]
            d['centroid_mzs'] = ['{:010.4f}'.format(mz) if mz else '' for mz in d['centroid_mzs']]
            d['mz'] = d['centroid_mzs'][0]
            d['ion_add_pol'] = '[M{}]{}'.format(d['adduct'], d['polarity'])

            fdr = round(d['fdr'] * 100, 2)
            # assert fdr in fdr_levels
            annotation_counts[fdr] += 1

            add_str = d['adduct'].replace('+', 'plus_').replace('-', 'minus_')
            to_index.append({
                '_index': self.index,
                '_type': 'annotation',
                '_id': '{}_{}_{}_{}_{}'.format(d['ds_id'], mol_db.name, mol_db.version,
                                               d['sf'], add_str),
                '_source': d
            })

            if len(to_index) >= n:
                bulk(self._es, actions=to_index, timeout='60s')
                to_index = []

        bulk(self._es, actions=to_index, timeout='60s')
        for i, level in enumerate(fdr_levels[1:]):
            annotation_counts[level] += annotation_counts[fdr_levels[i]]
        dataset['annotation_counts'].append({
            'db': {'name': mol_db.name, 'version': mol_db.version},
            'counts': [{'level': level, 'n': annotation_counts[level]} for level in fdr_levels]
        })
        self._es.index(self.index, doc_type='dataset', body=dataset, id=ds_id)

    # TODO: add a test
    def delete_ds(self, ds_id, mol_db=None):
        try:
            if mol_db:
                self._remove_mol_db_from_dataset(ds_id, mol_db)
            else:
                self._es.delete(id=ds_id, doc_type='dataset', index=self.index)
        except NotFoundError:
            pass

        must = [{'term': {'ds_id': ds_id}}]
        if mol_db:
            must.append({'term': {'db_name': mol_db.name}})
            must.append({'term': {'db_version': mol_db.version}})
        body = {
            'query': {
                'constant_score': {
                    'filter': {
                        'bool': {'must': must}}}}
        }
        res = self._es.search(index=self.index, body=body, _source=False, size=10 ** 9)['hits']['hits']
        to_del = [{'_op_type': 'delete', '_index': 'sm', '_type': 'annotation', '_id': d['_id']} for d in res]

        logger.info('Deleting %s documents from ES: %s, %s', len(to_del), ds_id, mol_db)
        del_n = 0
        try:
            del_n, _ = bulk(self._es, to_del, timeout='60s')
        except BulkIndexError as e:
            logger.warning('{} - {}'.format(e.args[0], e.args[1][1]))
        return del_n
