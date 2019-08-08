from functools import wraps
from time import sleep
from elasticsearch import Elasticsearch, NotFoundError, ElasticsearchException, ConflictError
from elasticsearch.helpers import parallel_bulk
from elasticsearch.client import IndicesClient, IngestClient
import logging
from collections import defaultdict, MutableMapping
import pandas as pd
import random

from peewee import JOIN, fn, SQL, Case

from sm.engine.dataset_locker import DatasetLocker
from sm.engine.formula_parser import format_ion_formula
from sm.engine.peewee.db import db, DbDataset, Job, Annotation
from sm.engine.peewee.graphql import GqlDataset, User, Group, DatasetProject, Project
from sm.engine.util import SMConfig

logger = logging.getLogger('engine')

@db.connection_context()
def _select_annotations_by_ds_id(ds_id, mol_db_id):
    annotations = (Annotation
                   .select(
                        Annotation.id.alias('annotation_id'),
                        Annotation.formula,
                        fn.COALESCE(Annotation.stats['chaos'].cast('text').cast('real'), 0.0).cast('real').alias('chaos'),
                        fn.COALESCE(Annotation.stats['spatial'].cast('text').cast('real'), 0.0).cast('real').alias('image_corr'),
                        fn.COALESCE(Annotation.stats['spectral'].cast('text').cast('real'), 0.0).cast('real').alias('pattern_match'),
                        Annotation.stats['total_iso_ints'].as_json().alias('total_iso_ints'),
                        Annotation.stats['min_iso_ints'].as_json().alias('min_iso_ints'),
                        Annotation.stats['max_iso_ints'].as_json().alias('max_iso_ints'),
                        fn.COALESCE(Annotation.msm, 0.0).alias('msm'),
                        Annotation.adduct,
                        Annotation.neutral_loss,
                        Annotation.chem_mod,
                        Job.id.alias('job_id'),
                        Annotation.fdr,
                        Annotation.iso_image_ids,
                        Case(DbDataset.config['isotope_generation']['charge'].cast('text'), [('-1', '-'), ('1', '+')]).alias('polarity'),
                        Annotation.off_sample['prob'].as_json().alias('off_sample_prob'),
                        Annotation.off_sample['label'].as_json().alias('off_sample_label'),
                    )
                   .join(Job)
                   .join_from(Job, DbDataset)
                   .where((DbDataset.id == ds_id) & (Job.db_id == mol_db_id))
                   .order_by(fn.COALESCE(Annotation.msm, 0).desc()))
    return list(annotations.dicts())

@db.connection_context()
def _select_ds_by_id(ds_id):
    ds = (DbDataset
          .select(DbDataset, GqlDataset, User, Group, DatasetProject, Project)
          .join_from(DbDataset, GqlDataset, JOIN.LEFT_OUTER, on=(DbDataset.id == GqlDataset.id), attr='gql_dataset')
          .join_from(GqlDataset, User, JOIN.LEFT_OUTER)
          .join_from(GqlDataset, Group, JOIN.LEFT_OUTER)
          .join_from(GqlDataset, DatasetProject, JOIN.LEFT_OUTER)
          .join_from(DatasetProject, Project, JOIN.LEFT_OUTER)
          .where(DbDataset.id == ds_id)
          .get())
    submitter = ds.gql_dataset and ds.gql_dataset.user
    group = ds.gql_dataset and ds.gql_dataset.group
    group_approved = ds.gql_dataset and ds.gql_dataset.group_approved
    dataset_projects = ds.gql_dataset and ds.gql_dataset.dataset_projects or []
    projects = [dp.project for dp in dataset_projects if dp.approved]
    last_finished = ds.jobs.select(fn.MAX(Job.finish)).scalar()

    return {
        'ds_id': ds.id,
        'ds_name': ds.name,
        'ds_config': ds.config,
        'ds_meta': ds.metadata,
        'ds_input_path': ds.input_path,
        'ds_upload_dt': ds.upload_dt,
        'ds_status': ds.status,
        'ds_last_finished': last_finished.strftime('%Y-%m-%d %H:%M:%S') if last_finished else None,
        'ds_is_public': ds.is_public,
        'ds_mol_dbs': ds.config['databases'],
        'ds_adducts': ds.config.get('isotope_generation', {}).get('adducts'),
        'ds_neutral_losses': ds.config.get('isotope_generation', {}).get('neutral_losses'),
        'ds_chem_mods': ds.config.get('isotope_generation', {}).get('chem_mods'),
        'ds_acq_geometry': ds.acq_geometry,
        'ds_ion_img_storage': ds.ion_img_storage_type,
        'ds_submitter_id': submitter and submitter.id,
        'ds_submitter_name': submitter and submitter.name,
        'ds_submitter_email': submitter and (submitter.email or submitter.not_verified_email),
        'ds_group_id': group and group.id,
        'ds_group_name': group and group.name,
        'ds_group_short_name': group and group.short_name,
        'ds_group_approved': group_approved,
        'ds_project_ids': [p.id for p in projects],
        'ds_project_names': [p.name for p in projects],
    }

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
        indices = self._ind_client.get_alias(name=alias)
        assert len(indices) > 0, f'Could not find ElasticSearch alias "{alias}"'

        index = next(iter(indices.keys()))
        if len(indices) > 1:
            logger.warning(f'Multiple indices mapped on to the same alias: {indices}. Arbitrarily choosing {index}')

        assert index == yin or index == yang, f'Unexpected ElasticSearch alias "{alias}" => "{index}"'

        return index

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
        dataset_properties = {
            "ds_id": {"type": "keyword"},
            "ds_name": {
                "type": "keyword",
                "fields": {
                    "searchable": {"type": "text", "analyzer": "delimited_ds_names"},
                }
            },
        }
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
                        },
                        "analyzer": {
                            # Support ds names that are delimited with underscores, dashes, etc.
                            "delimited_ds_names": {
                                "type": "custom",
                                "tokenizer": "standard",
                                "filter": ["lowercase", "asciifolding", "my_word_delimeter"],
                            },
                        },
                        "filter": {
                            "my_word_delimeter": {
                                "type": "word_delimiter",
                                "catenate_all": True,
                                "preserve_original": True
                            }
                        }
                    }
                }
            },
            "mappings": {
                "dataset": {
                    "dynamic_templates": dynamic_templates,
                    "properties": dataset_properties
                },
                "annotation": {
                    "dynamic_templates": dynamic_templates,
                    "properties": {
                        **dataset_properties,
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
                        "db_version": {"type": "keyword"},  # Prevent "YYYY-MM"-style DB versions from being parsed as dates
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

    def get_index_stats(self, index):
        data = self._ind_client.stats(index, metric="docs,store")
        ind_data = data['indices'][index]['total']
        return ind_data['docs']['count'], ind_data['store']['size_in_bytes']



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
        self._get_mol_by_formula_dict_cache = dict()

    def _remove_mol_db_from_dataset(self, ds_id, mol_db):
        dataset = self._es.get_source(self.index, id=ds_id, doc_type='dataset')
        dataset['annotation_counts'] = \
            [entry for entry in dataset.get('annotation_counts', [])
                   if not (entry['db']['name'] == mol_db.name and
                           entry['db']['version'] == mol_db.version)]
        self._es.update(self.index, id=ds_id, body={'doc': dataset}, doc_type='dataset')
        return dataset

    @retry_on_conflict()
    def sync_dataset(self, ds_id):
        """ Warning: This will wait till ES index/update is completed
        """
        with self._ds_locker.lock(ds_id):
            ds = _select_ds_by_id(ds_id)
            if self._es.exists(index=self.index, doc_type='dataset', id=ds_id):
                self._es.update(index=self.index, id=ds_id,
                                doc_type='dataset', body={'doc': ds}, params={'refresh': 'wait_for'})
            else:
                self._es.index(index=self.index, id=ds_id,
                               doc_type='dataset', body=ds, params={'refresh': 'wait_for'})

    def _get_mol_by_formula_dict(self, mol_db):
        try:
            return self._get_mol_by_formula_dict_cache[mol_db.id]
        except KeyError:
            mols = mol_db.get_molecules()
            by_formula = mols.groupby('sf')
            # limit IDs and names to 50 each to prevent ES 413 Request Entity Too Large error
            mol_by_formula_df = pd.concat([by_formula.apply(lambda df: df.mol_id.values[:50].tolist()),
                                      by_formula.apply(lambda df: df.mol_name.values[:50].tolist())], axis=1)
            mol_by_formula_df.columns = ['mol_ids', 'mol_names']
            mol_by_formula_dict = mol_by_formula_df.apply(lambda row: (row.mol_ids, row.mol_names), axis=1).to_dict()

            self._get_mol_by_formula_dict_cache[mol_db.id] = mol_by_formula_dict
            return mol_by_formula_dict

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
                ds_doc = _select_ds_by_id(ds_id)
            if 'annotation_counts' not in ds_doc:
                ds_doc['annotation_counts'] = []

            annotation_counts = defaultdict(int)
            fdr_levels = [5, 10, 20, 50]

            annotation_docs = _select_annotations_by_ds_id(ds_id, mol_db.id)
            logger.info('Indexing {} documents: {}, {}'.format(len(annotation_docs), ds_id, mol_db))

            to_index = []
            mol_by_formula = self._get_mol_by_formula_dict(mol_db)
            for doc in annotation_docs:
                self._add_ds_fields_to_ann(doc, ds_doc)
                doc['db_name'] = mol_db.name
                doc['db_version'] = mol_db.version
                formula = doc['formula']
                ion_without_pol = format_ion_formula(formula, doc['chem_mod'], doc['neutral_loss'], doc['adduct'])
                doc['ion'] = ion_without_pol + doc['polarity']
                doc['comp_ids'], doc['comp_names'] = mol_by_formula[formula]
                mzs, _ = isocalc.centroids(ion_without_pol)
                doc['centroid_mzs'] = list(mzs)
                doc['mz'] = mzs[0]

                fdr = round(doc['fdr'] * 100, 2)
                # assert fdr in fdr_levels
                annotation_counts[fdr] += 1

                to_index.append({
                    '_index': self.index,
                    '_type': 'annotation',
                    '_id': f"{doc['ds_id']}_{doc['annotation_id']}",
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
                ds_doc = _select_ds_by_id(ds_id)

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
            except NotFoundError:
                pass
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
