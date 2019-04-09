from functools import wraps
from time import sleep
from elasticsearch import Elasticsearch, NotFoundError, ElasticsearchException, ConflictError
from elasticsearch.helpers import parallel_bulk
from elasticsearch.client import IndicesClient, IngestClient
import logging
from collections import defaultdict, MutableMapping
import pandas as pd
import random

from sm.engine.dataset_locker import DatasetLocker
from sm.engine.util import SMConfig

logger = logging.getLogger('engine')

ANNOTATION_COLUMNS = ["sf", "sf_adduct",
                      "chaos", "image_corr", "pattern_match", "total_iso_ints", "min_iso_ints", "max_iso_ints", "msm",
                      "adduct", "job_id", "fdr",
                      "iso_image_ids", "polarity"]

ANNOTATIONS_SEL = '''SELECT
    m.sf AS sf,
    CONCAT(m.sf, m.adduct) AS sf_adduct,
    COALESCE(((m.stats -> 'chaos'::text)::text)::real, 0::real) AS chaos,
    COALESCE(((m.stats -> 'spatial'::text)::text)::real, 0::real) AS image_corr,
    COALESCE(((m.stats -> 'spectral'::text)::text)::real, 0::real) AS pattern_match,
    (m.stats -> 'total_iso_ints'::text) AS total_iso_ints,
    (m.stats -> 'min_iso_ints'::text) AS min_iso_ints,
    (m.stats -> 'max_iso_ints'::text) AS max_iso_ints,
    COALESCE(m.msm, 0::real) AS msm,
    m.adduct AS adduct,
    j.id AS job_id,
    m.fdr AS fdr,
    m.iso_image_ids AS iso_image_ids,
    ds.config->'isotope_generation'->'charge'->'polarity' AS polarity,
    m.off_sample->'prob' as off_sample_prob,
    m.off_sample->'label' as off_sample_label
FROM iso_image_metrics m
JOIN job j ON j.id = m.job_id
JOIN dataset ds ON ds.id = j.ds_id
WHERE ds.id = %s AND m.db_id = %s
ORDER BY COALESCE(m.msm, 0::real) DESC'''

DATASET_SEL = '''SELECT
    d.*,
    gu.id as ds_submitter_id,
    gu.name as ds_submitter_name,
    COALESCE(gu.email, gu.not_verified_email) as ds_submitter_email,
    gg.id as ds_group_id,
    gg.name as ds_group_name,
    gg.short_name as ds_group_short_name,
    gd.group_approved as ds_group_approved,
    COALESCE(gp.ds_project_ids, '{}') as ds_project_ids,
    COALESCE(gp.ds_project_names, '{}') as ds_project_names
FROM (
  SELECT
    d.id AS ds_id,
    d.name AS ds_name,
    d.config AS ds_config,
    d.metadata AS ds_meta,
    d.input_path AS ds_input_path,
    d.upload_dt AS ds_upload_dt,
    d.status AS ds_status,
    to_char(max(job.finish), 'YYYY-MM-DD HH24:MI:SS') AS ds_last_finished,
    d.is_public AS ds_is_public,
    d.mol_dbs AS ds_mol_dbs,
    d.adducts AS ds_adducts,
    d.acq_geometry AS ds_acq_geometry,
    d.ion_img_storage_type AS ds_ion_img_storage
  FROM dataset as d
  LEFT JOIN job ON job.ds_id = d.id
  GROUP BY d.id) as d
LEFT JOIN graphql.dataset gd ON gd.id = d.ds_id
LEFT JOIN graphql.user gu ON gu.id = gd.user_id
LEFT JOIN graphql.group gg ON gg.id = gd.group_id
LEFT JOIN (
    SELECT gdp.dataset_id, array_agg(gp.id)::text[] as ds_project_ids, array_agg(gp.name)::text[] as ds_project_names
    FROM graphql.dataset_project gdp
    JOIN graphql.project gp ON gdp.project_id = gp.id
    WHERE gdp.approved
    GROUP BY gdp.dataset_id
) gp ON gp.dataset_id = d.ds_id
WHERE d.ds_id = %s'''

DS_COLUMNS_TO_SKIP_IN_ANN = ('ds_acq_geometry',)


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
                    "type": "keyword",
                    "normalizer": "default",
                    "fields": {
                        "raw": {
                            "type": "keyword"
                        }
                    }
                }
            }
        }]
        body = {
            "settings": {
                "index": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                    "max_result_window": 2147483647,
                    "analysis": {
                        "normalizer": {
                            "default": {
                                "type": "custom",
                                "filter": ["lowercase", "asciifolding"]
                            }
                        }
                    }
                }
            },
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
                        "chaos": {"type": "float"},
                        "image_corr": {"type": "float"},
                        "pattern_match": {"type": "float"},
                        "total_iso_ints": {"type": "float"},
                        "min_iso_ints": {"type": "float"},
                        "max_iso_ints": {"type": "float"},
                        "msm": {"type": "float"},
                        "fdr": {"type": "float"},
                        "off_sample_prob": {"type": "float"},
                        "off_sample_label": {"type": "keyword"},
                    }
                }
            }
        }

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


def flatten_doc(doc, parent_key='', sep='.'):
    items = []
    for k, v in doc.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, MutableMapping):
            items.extend(flatten_doc(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def retry_on_conflict(num_retries=3):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(num_retries):
                try:
                    return func(*args, **kwargs)
                except ConflictError:
                    delay = random.uniform(2, 5 + i * 3)
                    logger.warning(f'ElasticSearch update conflict on attempt {i+1}. '
                                   f'Retrying after {delay:.1f} seconds...')
                    sleep(delay)
            # Last attempt, don't catch the exception
            return func(*args, **kwargs)
    
        return wrapper

    return decorator

class ESExporter(object):
    def __init__(self, db, es_config=None):
        self.sm_config = SMConfig.get_conf()
        if not es_config:
            es_config = self.sm_config['elasticsearch']
        self._es = init_es_conn(es_config)
        self._ingest = IngestClient(self._es)
        self._db = db
        self._ds_locker = DatasetLocker(self.sm_config['db'])
        self.index = es_config['index']
        self._get_mol_by_sf_dict_cache = dict()

    def _remove_mol_db_from_dataset(self, ds_id, mol_db):
        dataset = self._es.get_source(self.index, id=ds_id, doc_type='dataset')
        dataset['annotation_counts'] = \
            [entry for entry in dataset.get('annotation_counts', [])
                   if not (entry['db']['name'] == mol_db.name and
                           entry['db']['version'] == mol_db.version)]
        self._es.update(self.index, id=ds_id, body={'doc': dataset}, doc_type='dataset')
        return dataset

    def _select_ds_by_id(self, ds_id):
        return self._db.select_with_fields(DATASET_SEL, params=(ds_id,))[0]

    @retry_on_conflict()
    def sync_dataset(self, ds_id):
        """ Warning: This will wait till ES index/update is completed
        """
        with self._ds_locker.lock(ds_id):
            ds = self._select_ds_by_id(ds_id)
            if self._es.exists(index=self.index, doc_type='dataset', id=ds_id):
                self._es.update(index=self.index, id=ds_id,
                                doc_type='dataset', body={'doc': ds}, params={'refresh': 'wait_for'})
            else:
                self._es.index(index=self.index, id=ds_id,
                               doc_type='dataset', body=ds, params={'refresh': 'wait_for'})

    def _get_mol_by_sf_dict(self, mol_db):
        try:
            return self._get_mol_by_sf_dict_cache[mol_db.id]
        except KeyError:
            mols = mol_db.get_molecules()
            by_sf = mols.groupby('sf')
            # limit IDs and names to 50 each to prevent ES 413 Request Entity Too Large error
            mol_by_sf_df = pd.concat([by_sf.apply(lambda df: df.mol_id.values[:50].tolist()),
                                      by_sf.apply(lambda df: df.mol_name.values[:50].tolist())], axis=1)
            mol_by_sf_df.columns = ['mol_ids', 'mol_names']
            mol_by_sf_dict = mol_by_sf_df.apply(lambda row: (row.mol_ids, row.mol_names), axis=1).to_dict()

            self._get_mol_by_sf_dict_cache[mol_db.id] = mol_by_sf_dict
            return mol_by_sf_dict

    def _add_ds_fields_to_ann(self, ann_doc, ds_doc):
        for f in ds_doc:
            if f not in DS_COLUMNS_TO_SKIP_IN_ANN:
                ann_doc[f] = ds_doc[f]

    @retry_on_conflict()
    def index_ds(self, ds_id, mol_db, isocalc):
        with self._ds_locker.lock(ds_id):
            try:
                ds_doc = self._remove_mol_db_from_dataset(ds_id, mol_db)
            except NotFoundError:
                ds_doc = self._select_ds_by_id(ds_id)
            if 'annotation_counts' not in ds_doc:
                ds_doc['annotation_counts'] = []

            annotation_counts = defaultdict(int)
            fdr_levels = [5, 10, 20, 50]

            annotation_docs = self._db.select_with_fields(ANNOTATIONS_SEL, params=(ds_id, mol_db.id))
            logger.info('Indexing {} documents: {}, {}'.format(len(annotation_docs), ds_id, mol_db))

            to_index = []
            mol_by_sf = self._get_mol_by_sf_dict(mol_db)
            for doc in annotation_docs:
                self._add_ds_fields_to_ann(doc, ds_doc)
                doc['db_name'] = mol_db.name
                doc['db_version'] = mol_db.version
                sf = doc['sf']
                doc['comp_ids'], doc['comp_names'] = mol_by_sf[sf]
                mzs, _ = isocalc.ion_centroids(sf, doc['adduct'])
                doc['centroid_mzs'] = list(mzs)
                doc['mz'] = mzs[0]
                doc['ion_add_pol'] = '[M{}]{}'.format(doc['adduct'], doc['polarity'])

                fdr = round(doc['fdr'] * 100, 2)
                # assert fdr in fdr_levels
                annotation_counts[fdr] += 1

                add_str = doc['adduct'].replace('+', 'plus_').replace('-', 'minus_')
                to_index.append({
                    '_index': self.index,
                    '_type': 'annotation',
                    '_id': '{}_{}_{}_{}_{}'.format(doc['ds_id'], mol_db.name, mol_db.version,
                                                   doc['sf'], add_str),
                    '_source': doc
                })

            for success, info in parallel_bulk(self._es, actions=to_index, timeout='60s'):
                if not success:
                    logger.error(f'Document failed: {info}')

            for i, level in enumerate(fdr_levels[1:]):
                annotation_counts[level] += annotation_counts[fdr_levels[i]]
            ds_doc['annotation_counts'].append({
                'db': {'name': mol_db.name, 'version': mol_db.version},
                'counts': [{'level': level, 'n': annotation_counts[level]} for level in fdr_levels]
            })
            self._es.index(self.index, doc_type='dataset', body=ds_doc, id=ds_id)

    @retry_on_conflict()
    def update_ds(self, ds_id, fields):
        with self._ds_locker.lock(ds_id):
            pipeline_id = f'update-ds-fields-{ds_id}'
            if fields:
                ds_doc = self._select_ds_by_id(ds_id)

                ds_doc_upd = {}
                for f in fields:
                    if f == 'submitter_id':
                        ds_doc_upd['ds_submitter_id'] = ds_doc['ds_submitter_id']
                        ds_doc_upd['ds_submitter_name'] = ds_doc['ds_submitter_name']
                        ds_doc_upd['ds_submitter_email'] = ds_doc['ds_submitter_email']
                    elif f == 'group_id':
                        ds_doc_upd['ds_group_id'] = ds_doc['ds_group_id']
                        ds_doc_upd['ds_group_name'] = ds_doc['ds_group_name']
                        ds_doc_upd['ds_group_short_name'] = ds_doc['ds_group_short_name']
                        ds_doc_upd['ds_group_approved'] = ds_doc['ds_group_approved']
                    elif f == 'project_ids':
                        ds_doc_upd['ds_project_ids'] = ds_doc['ds_project_ids']
                        ds_doc_upd['ds_project_names'] = ds_doc['ds_project_names']
                    elif f == 'metadata':
                        ds_meta_flat_doc = flatten_doc(ds_doc['ds_meta'], parent_key='ds_meta')
                        ds_doc_upd.update(ds_meta_flat_doc)
                    elif f'ds_{f}' in ds_doc:
                        ds_doc_upd[f'ds_{f}'] = ds_doc[f'ds_{f}']

                processors = []
                for k, v in ds_doc_upd.items():
                    if v is None:
                        processors.append({'remove': {'field': k}})
                    else:
                        processors.append({'set': {'field': k, 'value': v}})
                self._ingest.put_pipeline(
                    id=pipeline_id,
                    body={'processors': processors})
                try:
                    self._es.update_by_query(
                        index=self.index,
                        body={'query': {'term': {'ds_id': ds_id}}},
                        params={
                            'pipeline': pipeline_id,
                            'wait_for_completion': True,
                            'refresh': 'wait_for',
                            'request_timeout': 60,
                        })
                finally:
                    self._ingest.delete_pipeline(pipeline_id)

    @retry_on_conflict()
    def delete_ds(self, ds_id, mol_db=None, delete_dataset=True):
        """
        If mol_db passed, only annotation statistics are updated in the dataset document. DS document won't be deleted

        :param ds_id: str
        :param mol_db: sm.engine.MolecularDB
        :return:
        """
        with self._ds_locker.lock(ds_id):
            logger.info('Deleting or updating dataset document in ES: %s, %s', ds_id, mol_db)

            must = [{'term': {'ds_id': ds_id}}]
            body = {
                'query': {
                    'constant_score': {
                        'filter': {
                            'bool': {'must': must}}}}
            }

            try:
                if mol_db:
                    self._remove_mol_db_from_dataset(ds_id, mol_db)
                elif delete_dataset:
                    self._es.delete(id=ds_id, index=self.index, doc_type='dataset')
            except ElasticsearchException as e:
                logger.warning('Dataset deletion failed: %s', e)

            logger.info('Deleting annotation documents from ES: %s, %s', ds_id, mol_db)

            if mol_db:
                must.append({'term': {'db_name': mol_db.name}})
                must.append({'term': {'db_version': mol_db.version}})

            try:
                resp = self._es.delete_by_query(index=self.index, body=body,
                                                doc_type='annotation', conflicts='proceed')
                logger.debug(resp)
            except ElasticsearchException as e:
                logger.warning('Annotation deletion failed: %s', e)
