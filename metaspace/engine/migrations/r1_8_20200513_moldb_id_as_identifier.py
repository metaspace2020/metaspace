import json

from elasticsearch import Elasticsearch
from elasticsearch.client import IngestClient

from sm.engine.db import DB, ConnectionPool
from sm.engine.es_export import init_es_conn
from sm.engine.util import GlobalInit, SMConfig


def build_moldb_map():
    data = DB().select_with_fields('SELECT id, name FROM molecular_db')
    moldb_name_id_map = {}
    for doc in data:
        moldb_name_id_map[doc['name']] = doc['id']
    return moldb_name_id_map


def update_db_dataset(ds_doc):
    print(f'Updating dataset {ds_doc["id"]} in database')
    DB().alter(
        'UPDATE dataset SET config = %s WHERE id = %s',
        params=(json.dumps(ds_doc['config']), ds_doc['id']),
    )


def update_db_coloc_job(moldb_name_id_map):
    print(f'Updating coloc jobs')
    for moldb_name, moldb_id in moldb_name_id_map.items():
        print(f'Replacing {moldb_name} with {moldb_id}')
        DB().alter(
            'UPDATE graphql.coloc_job SET mol_db = %s WHERE mol_db = %s',
            params=(moldb_id, moldb_name),
        )


def update_es_docs(doc_type, search_terms, update_values):
    pipeline_id = f'update-fields-{doc_type}-{"-".join(search_terms.values())}'
    processors = [
        {'set': {'field': field, 'value': value}} for field, value in update_values.items()
    ]
    resp = ingest.put_pipeline(id=pipeline_id, body={'processors': processors})
    print('create pipeline', pipeline_id, resp)

    must_terms = [{'term': {field: value}} for field, value in search_terms.items()]
    resp = es.update_by_query(
        index='sm',
        doc_type=doc_type,
        body={'query': {'bool': {'must': must_terms}}},
        params={
            'pipeline': pipeline_id,
            'wait_for_completion': True,
            'refresh': 'wait_for',
            'request_timeout': 5 * 60,
        },
    )
    print('update_by_query', resp)

    resp = ingest.delete_pipeline(pipeline_id)
    print('delete pipeline', pipeline_id, resp)


# _type: annotation
# fields: ds_moldb_ids, ds_config.databases, db_id
def update_es_annotation(ds_doc, moldb_name_id_map_rev):
    ds_id = ds_doc['id']
    moldb_ids = ds_doc['config']['databases']
    moldb_names = [moldb_name_id_map_rev[id] for id in moldb_ids]

    for moldb_id, moldb_name in zip(moldb_ids, moldb_names):
        print(ds_id, moldb_id, moldb_name)
        update_es_docs(
            doc_type='annotation',
            search_terms={'ds_id': ds_id, 'db_name': moldb_name},
            update_values={
                'ds_moldb_ids': moldb_ids,
                'ds_config.databases': moldb_ids,
                'db_id': moldb_id,
            },
        )


# _type: dataset
# fields: ds_config.databases, ds_moldb_ids, annotation_counts.db.id
def update_es_dataset(ds_doc, moldb_name_id_map):
    ds_id = ds_doc['id']
    moldb_ids = ds_doc['config']['databases']
    print(ds_id, moldb_ids)

    res = es.search(index='sm', doc_type='dataset', body={'query': {'term': {'ds_id': ds_id}}})
    ds_es_doc = res['hits']['hits'][0]['_source']
    annotation_counts = ds_es_doc['annotation_counts']
    for entry in annotation_counts:
        name = entry['db']['name']
        entry['db']['id'] = moldb_name_id_map.get(name, name)

    update_es_docs(
        doc_type='dataset',
        search_terms={'ds_id': ds_id},
        update_values={
            'ds_moldb_ids': moldb_ids,
            'ds_config.databases': moldb_ids,
            'annotation_counts': annotation_counts,
        },
    )


def migrate_moldbs():
    moldb_name_id_map = build_moldb_map()
    moldb_name_id_map_rev = {v: k for k, v in moldb_name_id_map.items()}

    update_db_coloc_job(moldb_name_id_map)

    datasets = DB().select_with_fields('SELECT id, config FROM dataset')
    for ds_doc in datasets:
        moldb_ids = [
            moldb_name_id_map.get(name_or_id, name_or_id)
            for name_or_id in ds_doc['config']['databases']
        ]
        ds_doc['config']['databases'] = moldb_ids

        update_db_dataset(ds_doc)
        update_es_dataset(ds_doc, moldb_name_id_map)
        update_es_annotation(ds_doc, moldb_name_id_map_rev)
        print()


if __name__ == '__main__':
    with GlobalInit() as sm_config:
        es: Elasticsearch = init_es_conn(sm_config['elasticsearch'])
        ingest: IngestClient = IngestClient(es)

        migrate_moldbs()
