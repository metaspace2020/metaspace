import logging
from collections import defaultdict
from collections.abc import MutableMapping
from typing import List, Any

import numpy as np
import pandas as pd
from elasticsearch import (
    TransportError,
    Elasticsearch,
    ElasticsearchException,
    NotFoundError,
)
from elasticsearch.client import IndicesClient, IngestClient
from elasticsearch.helpers import parallel_bulk

from sm.engine.utils.db_mutex import DBMutex
from sm.engine.db import DB
from sm.engine.annotation.fdr import FDR
from sm.engine.formula_parser import format_ion_formula
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine import molecular_db
from sm.engine.molecular_db import MolecularDB
from sm.engine.utils.retry_on_exception import retry_on_exception
from sm.engine.config import SMConfig

logger = logging.getLogger('engine')

ANNOTATIONS_SEL = '''SELECT
    m.id as annotation_id,
    m.formula AS formula,
    COALESCE(((m.stats -> 'chaos'::text)::text)::real, 0::real) AS chaos,
    COALESCE(((m.stats -> 'spatial'::text)::text)::real, 0::real) AS image_corr,
    COALESCE(((m.stats -> 'spectral'::text)::text)::real, 0::real) AS pattern_match,
    (m.stats -> 'total_iso_ints'::text) AS total_iso_ints,
    (m.stats -> 'min_iso_ints'::text) AS min_iso_ints,
    (m.stats -> 'max_iso_ints'::text) AS max_iso_ints,
    COALESCE(m.msm, 0::real) AS msm,
    m.adduct AS adduct,
    m.neutral_loss as neutral_loss,
    m.chem_mod as chem_mod,
    ion.ion_formula,
    j.id AS job_id,
    m.fdr AS fdr,
    m.iso_image_ids AS iso_image_ids,
    (CASE ds.config->'isotope_generation'->>'charge' WHEN '-1' THEN '-' WHEN '1' THEN '+' END) AS polarity,
    m.off_sample->'prob' as off_sample_prob,
    m.off_sample->'label' as off_sample_label
FROM annotation m
JOIN job j ON j.id = m.job_id
JOIN dataset ds ON ds.id = j.ds_id
LEFT JOIN graphql.ion ON m.ion_id = ion.id
WHERE ds.id = %s AND j.moldb_id = %s
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
    d.status_update_dt as ds_status_update_dt,
    to_char(max(job.finish), 'YYYY-MM-DD HH24:MI:SS') AS ds_last_finished,
    d.is_public AS ds_is_public,
    d.config #> '{database_ids}' AS ds_moldb_ids,
    d.config #> '{isotope_generation,adducts}' AS ds_adducts,
    d.config #> '{isotope_generation,neutral_losses}' AS ds_neutral_losses,
    d.config #> '{isotope_generation,chem_mods}' AS ds_chem_mods,
    d.acq_geometry AS ds_acq_geometry
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


class ESIndexManager:
    def __init__(self, es_config=None):
        if not es_config:
            es_config = SMConfig.get_conf()['elasticsearch']
        self._es = init_es_conn(es_config)
        self._ind_client = IndicesClient(self._es)

    def internal_index_name(self, alias):
        yin, yang = f'{alias}-yin', f'{alias}-yang'
        try:
            indices = self._ind_client.get_alias(name=alias)
        except NotFoundError:
            indices = {}
            logger.warning(f'Could not find ElasticSearch alias "{alias}"')

        index = next(iter(indices.keys()), None)
        if len(indices) > 1:
            logger.warning(
                f'Multiple indices mapped on to the same alias: {indices}. '
                f'Arbitrarily choosing {index}'
            )
        elif index is None:
            index = yin

        assert index in (yin, yang), f'Unexpected ElasticSearch alias "{alias}" => "{index}"'

        return index

    def create_index(self, index):
        dynamic_templates = [
            {
                "strings": {
                    "match_mapping_type": "string",
                    "mapping": {
                        "type": "keyword",
                        "normalizer": "default",
                        "fields": {"raw": {"type": "keyword"}},
                    },
                }
            }
        ]
        dataset_properties = {
            "ds_id": {"type": "keyword"},
            "ds_name": {
                "type": "keyword",
                "fields": {"searchable": {"type": "text", "analyzer": "delimited_ds_names"}},
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
                            "default": {"type": "custom", "filter": ["lowercase", "asciifolding"]}
                        },
                        "analyzer": {
                            # Support ds names that are delimited with underscores, dashes, etc.
                            "delimited_ds_names": {
                                "type": "custom",
                                "tokenizer": "standard",
                                "filter": ["lowercase", "asciifolding", "my_word_delimeter"],
                            }
                        },
                        "filter": {
                            "my_word_delimeter": {
                                "type": "word_delimiter",
                                "catenate_all": True,
                                "preserve_original": True,
                            }
                        },
                    },
                }
            },
            "mappings": {
                "dataset": {
                    "dynamic_templates": dynamic_templates,
                    "properties": dataset_properties,
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
                        "db_version": {
                            "type": "keyword"
                        },  # Prevent "YYYY-MM"-style DB versions from being parsed as dates
                        "isobars": {
                            "properties": {
                                "ion": {"type": "keyword", "include_in_all": False},
                                "ion_formula": {"type": "keyword", "include_in_all": False},
                            }
                        },
                    },
                },
            },
        }

        if not self._ind_client.exists(index):
            out = self._ind_client.create(index=index, body=body)
            logger.info(f'Index {index} created\n{out}')
        else:
            logger.info(f'Index {index} already exists')

    def delete_index(self, index):
        if self._ind_client.exists(index):
            out = self._ind_client.delete(index)
            logger.info(f'Index {index} deleted: {out}')

    def exists_index(self, index):
        return self._ind_client.exists(index)

    @staticmethod
    def another_index_name(index):
        assert index.endswith('yin') or index.endswith('yang')

        if index.endswith('yin'):  # pylint: disable=no-else-return
            return index.replace('yin', 'yang')
        else:
            return index.replace('yang', 'yin')

    def remap_alias(self, new_index, alias='sm'):
        old_index = self.another_index_name(new_index)
        logger.info(f'Remapping {alias} alias: {old_index} -> {new_index}')

        self._ind_client.update_aliases(
            {"actions": [{"add": {"index": new_index, "alias": alias}}]}
        )
        if self._ind_client.exists_alias(old_index, alias):
            self._ind_client.update_aliases(
                {"actions": [{"remove": {"index": old_index, "alias": alias}}]}
            )

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


class ESExporter:
    def __init__(self, db, sm_config=None):
        self.sm_config = sm_config or SMConfig.get_conf()
        self._es: Elasticsearch = init_es_conn(self.sm_config['elasticsearch'])
        self._ingest: IngestClient = IngestClient(self._es)
        self._db = db
        self._ds_locker = DBMutex(self.sm_config['db'])
        self.index = self.sm_config['elasticsearch']['index']
        self._get_mol_by_formula_dict_cache = dict()

    def _remove_mol_db_from_dataset(self, ds_id, moldb):
        ds_doc = self._es.get_source(self.index, id=ds_id, doc_type='dataset')
        ds_doc['annotation_counts'] = [
            entry for entry in ds_doc.get('annotation_counts', []) if entry['db']['id'] != moldb.id
        ]
        self._es.update(self.index, id=ds_id, body={'doc': ds_doc}, doc_type='dataset')
        return ds_doc

    def _select_ds_by_id(self, ds_id):
        return self._db.select_with_fields(DATASET_SEL, params=(ds_id,))[0]

    @retry_on_exception(TransportError)
    def sync_dataset(self, ds_id):
        """ Warning: This will wait till ES index/update is completed
        """
        with self._ds_locker.lock(ds_id):
            ds = self._select_ds_by_id(ds_id)
            if self._es.exists(index=self.index, doc_type='dataset', id=ds_id):
                self._es.update(
                    index=self.index,
                    id=ds_id,
                    doc_type='dataset',
                    body={'doc': ds},
                    params={'refresh': 'wait_for'},
                )
            else:
                self._es.index(
                    index=self.index,
                    id=ds_id,
                    doc_type='dataset',
                    body=ds,
                    params={'refresh': 'wait_for'},
                )

    def _get_mol_by_formula_dict(self, moldb):
        try:
            return self._get_mol_by_formula_dict_cache[moldb.id]
        except KeyError:
            mols = molecular_db.fetch_molecules(moldb.id)
            by_formula = mols.groupby('formula')
            # limit IDs and names to 50 each to prevent ES 413 Request Entity Too Large error
            mol_by_formula_df = pd.concat(
                [
                    by_formula.apply(lambda df: df.mol_id.values[:50].tolist()),
                    by_formula.apply(lambda df: df.mol_name.values[:50].tolist()),
                ],
                axis=1,
            )
            mol_by_formula_df.columns = ['mol_ids', 'mol_names']
            mol_by_formula_dict = mol_by_formula_df.apply(
                lambda row: (row.mol_ids, row.mol_names), axis=1
            ).to_dict()

            self._get_mol_by_formula_dict_cache[moldb.id] = mol_by_formula_dict
            return mol_by_formula_dict

    @staticmethod
    def _add_ds_fields_to_ann(ann_doc, ds_doc):
        for field in ds_doc:
            if field not in DS_COLUMNS_TO_SKIP_IN_ANN:
                ann_doc[field] = ds_doc[field]

    @staticmethod
    def _add_isomer_fields_to_anns(ann_docs):
        isomer_groups = defaultdict(list)
        isomer_comps = defaultdict(set)
        missing_ion_formulas = []

        for doc in ann_docs:
            if doc['ion_formula']:
                isomer_groups[doc['ion_formula']].append(doc['ion'])
                isomer_comps[doc['ion_formula']].update(doc['comp_ids'])
            else:
                missing_ion_formulas.append(doc['ion'])

        for doc in ann_docs:
            doc['isomer_ions'] = [
                ion for ion in isomer_groups[doc['ion_formula']] if ion != doc['ion']
            ]
            doc['comps_count_with_isomers'] = len(isomer_comps[doc['ion_formula']])

        if missing_ion_formulas:
            logger.warning(
                f'Missing ion formulas {len(missing_ion_formulas)}: {missing_ion_formulas[:20]}'
            )

    def _index_ds_annotations(self, ds_id, moldb, ds_doc, isocalc):
        annotation_docs = self._db.select_with_fields(ANNOTATIONS_SEL, params=(ds_id, moldb.id))
        logger.info(f'Indexing {len(annotation_docs)} documents: {ds_id}, {moldb}')

        annotation_counts = defaultdict(int)
        mol_by_formula = self._get_mol_by_formula_dict(moldb)
        for doc in annotation_docs:
            self._add_ds_fields_to_ann(doc, ds_doc)
            doc['db_id'] = moldb.id
            doc['db_name'] = moldb.name
            doc['db_version'] = moldb.version
            formula = doc['formula']
            ion_without_pol = format_ion_formula(
                formula, doc['chem_mod'], doc['neutral_loss'], doc['adduct']
            )
            doc['ion'] = ion_without_pol + doc['polarity']
            doc['comp_ids'], doc['comp_names'] = mol_by_formula[formula]
            mzs, _ = isocalc.centroids(ion_without_pol)
            doc['centroid_mzs'] = list(mzs) if mzs is not None else []
            doc['mz'] = mzs[0] if mzs is not None else 0

            if moldb.targeted:
                fdr_level = doc['fdr'] = -1
            else:
                fdr_level = FDR.nearest_fdr_level(doc['fdr'])
            annotation_counts[round(fdr_level * 100, 2)] += 1

        self._add_isomer_fields_to_anns(annotation_docs)
        ESExporterIsobars.add_isobar_fields_to_anns(annotation_docs, isocalc)
        to_index = []
        for doc in annotation_docs:
            to_index.append(
                {
                    '_index': self.index,
                    '_type': 'annotation',
                    '_id': f"{doc['ds_id']}_{doc['annotation_id']}",
                    '_source': doc,
                }
            )

        for success, info in parallel_bulk(self._es, actions=to_index, timeout='60s'):
            if not success:
                logger.error(f'Document failed: {info}')

        return annotation_counts

    @retry_on_exception(TransportError)
    def index_ds(self, ds_id: str, moldb: MolecularDB, isocalc: IsocalcWrapper):
        with self._ds_locker.lock(ds_id):
            try:
                ds_doc = self._remove_mol_db_from_dataset(ds_id, moldb)
            except NotFoundError:
                ds_doc = self._select_ds_by_id(ds_id)
                ds_doc['annotation_counts'] = []

            annotation_counts = self._index_ds_annotations(ds_id, moldb, ds_doc, isocalc)

            fdr_levels = [5, 10, 20, 50]
            # put cumulative annotation counts to ds_doc
            for i, level in enumerate(fdr_levels[1:]):
                annotation_counts[level] += annotation_counts[fdr_levels[i]]
            ds_doc['annotation_counts'].append(
                {
                    'db': {'id': moldb.id, 'name': moldb.name},
                    'counts': [
                        {'level': level, 'n': annotation_counts[level]} for level in fdr_levels
                    ],
                }
            )
            self._es.index(self.index, doc_type='dataset', body=ds_doc, id=ds_id)

    def reindex_ds(self, ds_id: str):
        """Delete and index dataset documents for all moldbs defined in the dataset config.

        Args:
            ds_id: dataset id
        """
        self.delete_ds(ds_id)

        ds_doc = DB().select_one_with_fields(
            "SELECT name, config FROM dataset WHERE id = %s", params=(ds_id,)
        )
        if ds_doc:
            isocalc = IsocalcWrapper(ds_doc['config'])
            for moldb_id in ds_doc['config']['database_ids']:
                moldb = molecular_db.find_by_id(moldb_id)
                try:
                    self.index_ds(ds_id, moldb=moldb, isocalc=isocalc)
                except Exception as e:
                    new_msg = (
                        f'Failed to reindex(ds_id={ds_id}, ds_name={ds_doc["name"]}, '
                        f'moldb: {moldb}): {e}'
                    )
                    logger.error(new_msg, exc_info=True)
        else:
            logger.warning(f'Dataset does not exist(ds_id={ds_id})')

    @staticmethod
    def _create_updated_ds_doc(ds_doc, fields):
        ds_doc_upd = {}
        for field in fields:
            if field == 'submitter_id':
                ds_doc_upd['ds_submitter_id'] = ds_doc['ds_submitter_id']
                ds_doc_upd['ds_submitter_name'] = ds_doc['ds_submitter_name']
                ds_doc_upd['ds_submitter_email'] = ds_doc['ds_submitter_email']
            elif field == 'group_id':
                ds_doc_upd['ds_group_id'] = ds_doc['ds_group_id']
                ds_doc_upd['ds_group_name'] = ds_doc['ds_group_name']
                ds_doc_upd['ds_group_short_name'] = ds_doc['ds_group_short_name']
                ds_doc_upd['ds_group_approved'] = ds_doc['ds_group_approved']
            elif field == 'project_ids':
                ds_doc_upd['ds_project_ids'] = ds_doc['ds_project_ids']
                ds_doc_upd['ds_project_names'] = ds_doc['ds_project_names']
            elif field == 'metadata':
                ds_meta_flat_doc = flatten_doc(ds_doc['ds_meta'], parent_key='ds_meta')
                ds_doc_upd.update(ds_meta_flat_doc)
            elif f'ds_{field}' in ds_doc:
                ds_doc_upd[f'ds_{field}'] = ds_doc[f'ds_{field}']
            else:
                logger.warning(f'Field ds_{field} not found in ds_doc')
        return ds_doc_upd

    @retry_on_exception(TransportError)
    def update_ds(self, ds_id, fields):
        with self._ds_locker.lock(ds_id):
            pipeline_id = f'update-ds-fields-{ds_id}'
            if fields:
                ds_doc_upd = self._create_updated_ds_doc(
                    ds_doc=self._select_ds_by_id(ds_id), fields=fields
                )
                processors = []
                for k, v in ds_doc_upd.items():
                    if v is None:
                        processors.append({'remove': {'field': k}})
                    else:
                        processors.append({'set': {'field': k, 'value': v}})
                self._ingest.put_pipeline(id=pipeline_id, body={'processors': processors})
                try:
                    self._es.update_by_query(
                        index=self.index,
                        body={'query': {'term': {'ds_id': ds_id}}},
                        params={
                            'pipeline': pipeline_id,
                            'wait_for_completion': True,
                            'refresh': 'wait_for',
                            'request_timeout': 5 * 60,
                        },
                    )
                finally:
                    self._ingest.delete_pipeline(pipeline_id)

    @retry_on_exception(TransportError)
    def delete_ds(self, ds_id: str, moldb: MolecularDB = None, delete_dataset: bool = True):
        """Completely or partially delete dataset.

        Args:
            ds_id: dataset id
            moldb: if passed, only annotation statistics are updated in the dataset document
                ds document won't be deleted.
            delete_dataset: if True, delete dataset document as well
        """
        with self._ds_locker.lock(ds_id):
            logger.info(f'Deleting or updating dataset document in ES: {ds_id}, {moldb}')

            try:
                if moldb:
                    self._remove_mol_db_from_dataset(ds_id, moldb)
                elif delete_dataset:
                    self._es.delete(id=ds_id, index=self.index, doc_type='dataset')
            except NotFoundError:
                pass
            except ElasticsearchException as e:
                logger.warning(f'Dataset deletion failed: {e}')

            logger.info(f'Deleting annotation documents from ES: {ds_id}, {moldb}')

            must: List[Any] = [{'term': {'ds_id': ds_id}}]
            if moldb:
                must.append({'term': {'db_id': moldb.id}})

            try:
                body = {'query': {'constant_score': {'filter': {'bool': {'must': must}}}}}
                resp = self._es.delete_by_query(  # pylint: disable=unexpected-keyword-arg
                    index=self.index, body=body, doc_type='annotation', conflicts='proceed'
                )
                logger.debug(resp)
            except ElasticsearchException as e:
                logger.warning(f'Annotation deletion failed: {e}')


class ESExporterIsobars:
    """
    A helper function for ESExport that grew too big to remain a single function.
    `ESExporterIsobars.add_isobar_fields_to_anns` computes the "isobars" field and adds it to
    every annotation in a list of annotation documents.
    """

    @classmethod
    def add_isobar_fields_to_anns(cls, ann_docs, isocalc):
        mzs_df = cls._build_mzs_df(ann_docs, isocalc)

        for _, peak_rows in mzs_df.groupby('id'):
            overlaps = cls._find_overlaps(mzs_df, peak_rows)
            cls._apply_overlap_group(peak_rows, overlaps)

    @staticmethod
    def _build_mzs_df(ann_docs, isocalc):
        peaks = []

        for doc in ann_docs:
            doc['isobars'] = []
            for peak_i, mz in enumerate(doc['centroid_mzs']):
                if (
                    mz != 0
                    and peak_i < len(doc['iso_image_ids'])
                    and doc['iso_image_ids'][peak_i] is not None
                ):
                    peaks.append(
                        (
                            doc['annotation_id'],
                            doc,
                            peak_i + 1,
                            mz,
                            doc['msm'],
                            doc['ion'],
                            doc['ion_formula'] or '',
                        )
                    )

        peaks_df = pd.DataFrame(
            peaks, columns=['id', 'doc', 'peak_n', 'mz', 'msm', 'ion', 'ion_formula']
        )
        mzs_df = peaks_df.sort_values('mz')

        mzs_df['lower_mz'], mzs_df['upper_mz'] = isocalc.mass_accuracy_bounds(mzs_df['mz'])
        mzs_df['lower_idx'] = np.searchsorted(mzs_df.upper_mz.values, mzs_df.lower_mz.values, 'l')
        mzs_df['upper_idx'] = np.searchsorted(mzs_df.lower_mz.values, mzs_df.upper_mz.values, 'r')
        return mzs_df

    @staticmethod
    def _find_overlaps(mzs_df, peak_rows):
        overlaps = defaultdict(list)
        # Use numpy arrays directly to minimize access times during the core loop
        _ids = mzs_df.id.values
        _ion_formulas = mzs_df.ion_formula.values
        _peak_ns = mzs_df.peak_n.values
        _docs = mzs_df.doc.values
        # Collect all other annotations that have any overlap with this annotation
        for lower_idx, upper_idx, ion_formula, peak_n in peak_rows[
            ['lower_idx', 'upper_idx', 'ion_formula', 'peak_n']
        ].itertuples(False, None):
            # Ignore annotations with "greater" ion_formula values as an optimization.
            # The backwards link from "greater" to "lesser" is populated below, and doing this
            # helps to ensure that the relationship is always reflexive.
            peak_overlap_is = (
                np.nonzero(_ion_formulas[lower_idx:upper_idx] < ion_formula)[0] + lower_idx
            )
            for peak_overlap_i in peak_overlap_is:
                overlaps[_ids[peak_overlap_i]].append(
                    (int(peak_n), int(_peak_ns[peak_overlap_i]), _docs[peak_overlap_i])
                )
        return overlaps

    @staticmethod
    def _apply_overlap_group(peak_rows, overlaps):
        doc = peak_rows.doc.iloc[0]
        # Add a list of other annotations where either both first peaks overlap,
        # or there are multiple overlaps.
        for overlap_rows in overlaps.values():
            peak_ns = sorted(row[:2] for row in overlap_rows)
            if len(peak_ns) > 1 or (1, 1) in peak_ns:
                overlap_doc = overlap_rows[0][2]
                doc['isobars'].append(
                    {
                        'ion_formula': overlap_doc['ion_formula'],
                        'ion': overlap_doc['ion'],
                        'msm': overlap_doc['msm'],
                        'peak_ns': peak_ns,
                    }
                )
                overlap_doc['isobars'].append(
                    {
                        'ion_formula': doc['ion_formula'],
                        'ion': doc['ion'],
                        'msm': doc['msm'],
                        'peak_ns': [(b, a) for a, b in peak_ns],
                    }
                )
