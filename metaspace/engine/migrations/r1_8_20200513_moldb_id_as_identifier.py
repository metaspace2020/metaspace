import json
import logging

from elasticsearch import Elasticsearch
from elasticsearch.client import IngestClient

from sm.engine.db import DB, ConnectionPool
from sm.engine.es_export import init_es_conn
from sm.engine.util import GlobalInit, SMConfig

logger = logging.getLogger('engine')


database_descriptions = {
    'HMDB-v4': {
        'description': 'Database containing small molecule metabolites known to be in the human body.',
        'full_name': 'Human Metabolome Database',
        'link': 'http://www.hmdb.ca/about',
        'citation': '''Wishart DS, Feunang YD, Marcu A, Guo AC, Liang K, et al.,
HMDB 4.0 &mdash; The Human Metabolome Database for 2018.
Nucleic Acids Res. 2018. Jan 4;46(D1):D608-17.
<a href="http://www.ncbi.nlm.nih.gov/pubmed/29140435">29140435</a>''',
    },
    'HMDB-v4-endogenous': {
        'description': 'A filtered version of HMDB that contains only molecules labelled in the database as endogenously produced.',
        'full_name': 'Human Metabolome Database Endogenous',
        'link': 'http://www.hmdb.ca/about',
        'citation': '''Wishart DS, Feunang YD, Marcu A, Guo AC, Liang K, et al.,
HMDB 4.0 &mdash; The Human Metabolome Database for 2018.
Nucleic Acids Res. 2018. Jan 4;46(D1):D608-17.
<a href="http://www.ncbi.nlm.nih.gov/pubmed/29140435">29140435</a>''',
    },
    'ChEBI-2018-01': {
        'description': 'A database and ontology of products of nature or synthetic products used to intervene in the processes of living organisms.',
        'full_name': 'Chemical Entities of Biological Interest',
        'link': 'https://www.ebi.ac.uk/chebi/aboutChebiForward.do',
        'citation': '''Hastings J, Owen G, Dekker A, Ennis M, Kale N, Muthukrishnan V, Turner S, Swainston N, Mendes P, Steinbeck C. (2016).
ChEBI in 2016: Improved services and an expanding collection of metabolites.
<a href="http://europepmc.org/abstract/MED/26467479">Nucleic Acids Res.</a>''',
    },
    'LipidMaps-2017-12-12': {
        'description': 'An experimentally determined list of all of the major and many minor lipid species in mammalian cells.',
        'full_name': 'LIPID Metabolites And Pathways Strategy',
        'link': 'http://www.lipidmaps.org/data/databases.html',
        'citation': '''LIPID MAPS structure database.
Sud M., Fahy E., Cotter D., Brown A., Dennis E., Glass C., Murphy R., Raetz C., Russell D., and Subramaniam S.,
Nucleic Acids Research 35, D527-32 (2006)''',
    },
    'BraChemDB-2018-01': {
        'description': 'A curated rapeseed database from LC-MS/MS measurements.',
        'full_name': 'Brassica Napus database',
        'link': '',
        'citation': '<i>University of Rennes 1</i>',
    },
    'PAMDB-v1.0': {
        'description': 'An experimentally determined database containing extensive metabolomic data and metabolic pathway diagrams about Pseudomonas aeruginosa (reference strain PAO1).',
        'full_name': 'Pseudomonas aeruginosa Metabolome Database',
        'link': 'http://pseudomonas.umaryland.edu/PAMDB',
        'citation': '''Weiliang Huang, Luke K. Brewer, Jace W. Jones, Angela T. Nguyen, Ana Marcu, David S. Wishart,
Amanda G. Oglesby-Sherrouse, Maureen A. Kane, and Angela Wilks (2018).
PAMDB: a comprehensive Pseudomonas aeruginosa metabolome database.
Nucleic Acids Res. 46(D1):D575-D580.
DOI: <a href="https://academic.oup.com/nar/article-lookup/doi/10.1093/nar/gkx1061">10.1093/nar/gkx1061</a>''',
    },
    'SwissLipids-2018-02-02': {
        'description': 'The set of known, expert curated lipids provided plus a library of theoretical lipid structures.',
        'full_name': 'SwissLipids',
        'link': 'http://www.swisslipids.org/#/about',
        'citation': '''Lucila Aimo, Robin Liechti, Nevila Hyka-Nouspikel, Anne Niknejad, Anne Gleizes, Lou Götz, Dmitry Kuznetsov,
Fabrice P.A. David, F. Gisou van der Goot, Howard Riezman, Lydie Bougueleret, Ioannis Xenarios, Alan Bridge;
The SwissLipids knowledgebase for lipid biology, <i>Bioinformatics</i>,
Volume 31, Issue 17, 1 September 2015, Pages 2860–2866,
<a href="https://doi.org/10.1093/bioinformatics/btv285">https://doi.org/10.1093/bioinformatics/btv285</a>''',
    },
    'ECMDB-2018-12': {
        'description': 'An expertly curated database containing extensive metabolomic data and metabolic pathway diagrams about Escherichia coli (strain K12, MG1655).',
        'full_name': 'E. coli Metabolome Database',
        'link': 'http://ecmdb.ca/about',
        'citation': ''' Sajed, T., Marcu, A., Ramirez, M., Pon, A., Guo, A., Knox, C., Wilson, M., Grant, J., Djoumbou,
Y. and Wishart, D. (2015). ECMDB 2.0: A richer resource for understanding the biochemistry of
E. coli. Nucleic Acids Res, p.gkv1060
<a href="https://www.ncbi.nlm.nih.gov/pubmed/26481353">https://www.ncbi.nlm.nih.gov/pubmed/26481353</a>''',
    },
}


def update_public_database_descriptions():
    db = DB()
    public_db_names = db.select(
        'SELECT name FROM molecular_db WHERE public = true AND archived = false'
    )
    logger.info(f'Updating public molecular databases: {public_db_names}')

    for (name,) in public_db_names:
        desc = database_descriptions.get(name, None)
        if desc:
            db.alter(
                "UPDATE molecular_db "
                "SET description = %s, full_name = %s, link = %s, citation = %s "
                "WHERE name = %s;",
                params=(
                    desc['description'],
                    desc['full_name'],
                    desc['link'],
                    desc['citation'],
                    name,
                ),
            )


def update_non_public_databases():
    logger.info('Updating non-public molecular databases')
    DB().alter(
        "UPDATE molecular_db "
        "SET group_id = ("
        "   SELECT id FROM graphql.\"group\" WHERE name = 'European Molecular Biology Laboratory'"
        ") "
        "WHERE public = false;"
    )


def build_moldb_map():
    data = DB().select_with_fields('SELECT id, name FROM molecular_db')
    moldb_name_id_map = {}
    for doc in data:
        moldb_name_id_map[doc['name']] = doc['id']
    return moldb_name_id_map


def update_db_dataset(ds_doc):
    logger.info(f'Updating dataset {ds_doc["id"]} in database')
    DB().alter(
        'UPDATE dataset SET config = %s WHERE id = %s',
        params=(json.dumps(ds_doc['config']), ds_doc['id']),
    )


def update_es_docs(doc_type, search_terms, update_values):
    pipeline_id = f'update-fields-{doc_type}-{"-".join(search_terms.values())}'
    processors = []
    for k, v in update_values.items():
        if v is None:
            processors.append({'remove': {'field': k}})
        else:
            processors.append({'set': {'field': k, 'value': v}})
    resp = ingest.put_pipeline(id=pipeline_id, body={'processors': processors})
    logger.info(f'create pipeline {pipeline_id}: {resp}')

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
    logger.info(f'update_by_query: {resp}')

    resp = ingest.delete_pipeline(pipeline_id)
    logger.info(f'delete pipeline {pipeline_id}: {resp}')


def update_es_annotations(ds_doc, moldb_name_id_map_rev):
    ds_id = ds_doc['id']
    moldb_ids = ds_doc['config']['database_ids']
    moldb_names = [moldb_name_id_map_rev[id] for id in moldb_ids]

    for moldb_id, moldb_name in zip(moldb_ids, moldb_names):
        logger.info(f'Update ES annotations: {ds_id}, {moldb_id}, {moldb_name}')
        update_es_docs(
            doc_type='annotation',
            search_terms={'ds_id': ds_id, 'db_name': moldb_name},
            update_values={
                'ds_moldb_ids': moldb_ids,
                'ds_config.database_ids': moldb_ids,
                'db_id': moldb_id,
            },
        )


def update_es_dataset(ds_doc, moldb_name_id_map):
    ds_id = ds_doc['id']
    moldb_ids = ds_doc['config']['database_ids']
    logger.info(f'Updating ES dataset: {ds_id}, {moldb_ids}')

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
            'ds_config.database_ids': moldb_ids,
            'annotation_counts': annotation_counts,
        },
    )


def migrate_moldbs():
    update_public_database_descriptions()
    update_non_public_databases()

    moldb_name_id_map = build_moldb_map()
    moldb_name_id_map_rev = {v: k for k, v in moldb_name_id_map.items()}

    datasets = DB().select_with_fields('SELECT id, config FROM dataset')
    failed_datasets = []
    for ds_doc in datasets:
        try:
            moldb_ids = [moldb_name_id_map[name] for name in ds_doc['config'].get('databases', [])]
            ds_doc['config']['database_ids'] = moldb_ids

            update_db_dataset(ds_doc)
            update_es_dataset(ds_doc, moldb_name_id_map)
            update_es_annotations(ds_doc, moldb_name_id_map_rev)
        except Exception as e:
            logger.warning(f'Failed to migrate dataset {ds_doc["id"]}: {e}')
            failed_datasets.append((ds_doc['id'], e))

    if failed_datasets:
        print(f'Failed datasets: {failed_datasets}')


if __name__ == '__main__':
    with GlobalInit() as sm_config:
        es: Elasticsearch = init_es_conn(sm_config['elasticsearch'])
        ingest: IngestClient = IngestClient(es)

        migrate_moldbs()
