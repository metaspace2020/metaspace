from elasticsearch import Elasticsearch, NotFoundError, ElasticsearchException
from elasticsearch.helpers import bulk, BulkIndexError
from elasticsearch.client import IndicesClient
import logging
from collections import defaultdict
import pandas as pd

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
    ds.config->'isotope_generation'->'charge'->'polarity' AS polarity
FROM iso_image_metrics m
JOIN job j ON j.id = m.job_id
JOIN dataset ds ON ds.id = j.ds_id
WHERE ds.id = %s AND m.db_id = %s
ORDER BY COALESCE(m.msm, 0::real) DESC'''

DATASET_SEL = '''SELECT
    dataset.id AS ds_id,
    name AS ds_name,
    config AS ds_config,
    metadata AS ds_meta,
    input_path AS ds_input_path,
    upload_dt AS ds_upload_dt,
    dataset.status AS ds_status,
    to_char(max(finish), 'YYYY-MM-DD HH24:MI:SS') AS ds_last_finished,
    is_public AS ds_is_public,
    mol_dbs AS ds_mol_dbs,
    adducts AS ds_adducts,
    acq_geometry AS ds_acq_geometry,
    ion_img_storage_type AS ds_ion_img_storage
FROM dataset LEFT JOIN job ON job.ds_id = dataset.id
WHERE dataset.id = %s
GROUP BY dataset.id'''

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
                        "normalizer": "default"}}
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
                    }}},
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
        self.sm_config = SMConfig.get_conf()
        if not es_config:
            es_config = self.sm_config['elasticsearch']
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

    def _ds_add_derived_fields(self, dataset):
        submitter = dataset.get('ds_meta', {}).get('Submitted_By', {}).get('Submitter', None)
        if submitter:
            dataset['ds_submitter'] = submitter.get('First_Name', '') + ' ' + submitter.get('Surname', '')
            dataset['ds_submitter_email'] = submitter.get('Email', '')

    def _ds_get_by_id(self, ds_id):
        dataset = self._db.select_with_fields(DATASET_SEL, params=(ds_id,))[0]
        self._ds_add_derived_fields(dataset)
        return dataset

    def sync_dataset(self, ds_id):
        dataset = self._ds_get_by_id(ds_id)
        if self._es.exists(index=self.index, doc_type='dataset', id=ds_id):
            self._es.update(index=self.index, id=ds_id, doc_type='dataset', body={'doc': dataset})
        else:
            self._es.index(index=self.index, id=ds_id, doc_type='dataset', body=dataset)

    def _get_mol_by_sf_df(self, mol_db):
        by_sf = mol_db.get_molecules().groupby('sf')
        mol_by_sf_df = pd.concat([by_sf.apply(lambda df: df.mol_id.values),
                                  by_sf.apply(lambda df: df.mol_name.values)], axis=1)
        mol_by_sf_df.columns = ['mol_ids', 'mol_names']
        return mol_by_sf_df

    def _add_ds_attrs_to_ann(self, ann, ds_attrs):
        for attr in ds_attrs:
            if attr not in DS_COLUMNS_TO_SKIP_IN_ANN:
                ann[attr] = ds_attrs[attr]

    def index_ds(self, ds_id, mol_db, isocalc):
        try:
            dataset = self._remove_mol_db_from_dataset(ds_id, mol_db)
        except NotFoundError:
            dataset = self._ds_get_by_id(ds_id)
        if 'annotation_counts' not in dataset:
            dataset['annotation_counts'] = []

        annotation_counts = defaultdict(int)
        fdr_levels = [5, 10, 20, 50]

        annotations = self._db.select_with_fields(ANNOTATIONS_SEL, params=(ds_id, mol_db.id))
        logger.info('Indexing {} documents: {}, {}'.format(len(annotations), ds_id, mol_db))

        n = 100
        to_index = []
        mol_by_sf_df = self._get_mol_by_sf_df(mol_db)
        for d in annotations:
            self._add_ds_attrs_to_ann(d, dataset)
            d['db_name'] = mol_db.name
            d['db_version'] = mol_db.version
            sf = d['sf']
            d['comp_ids'] = mol_by_sf_df.mol_ids.loc[sf][:50].tolist()  # to prevent ES 413 Request Entity Too Large error
            d['comp_names'] = mol_by_sf_df.mol_names.loc[sf][:50].tolist()
            mzs, _ = isocalc.ion_centroids(d['sf'], d['adduct'])
            d['centroid_mzs'] = list(mzs)
            d['mz'] = mzs[0]
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

    def delete_ds(self, ds_id, mol_db=None):
        """
        If mol_db passed, only annotation statistics are updated in the dataset document. DS document won't be deleted

        :param ds_id: str
        :param mol_db: sm.engine.MolecularDB
        :return:
        """
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
            else:
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
