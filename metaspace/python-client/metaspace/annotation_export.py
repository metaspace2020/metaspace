import logging
import argparse
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import pandas as pd

from metaspace.sm_annotation_utils import GraphQLClient, get_config

logger = logging.getLogger('mol-export')


def init_logger(level):
    logger_ = logging.getLogger('mol-export')
    logger_.setLevel(level)
    ch = logging.StreamHandler()
    ch.setLevel(level)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger_.addHandler(ch)


filter_field_name_mapping = {
    "ds": "ids",
    "subm": "submitter",
    "prj": "project",
    "grp": "group",
    "organism": "organism",
    "part": "organismPart",
    "fdr": "fdrLevel",
    "db": "database",
    "src": "ionisationSource",
    "matrix": "maldiMatrix",
    "mode": "polarity",
    "offs": "offSample",
    "colo": "colocalizedWith",
}

filter_field_value_preprocess = {
    "polarity": lambda v: {"Positive": "POSITIVE", "Negative": "NEGATIVE"}[v],
    "ids": lambda v: v.replace(',', '|'),
    "offSample": lambda v: bool(int(v)),
}

default_ds_filter = {
    "ids": None,
    "maldiMatrix": None,
    "ionisationSource": None,
    "metadataType": "Imaging MS",
    "organism": None,
    "organismPart": None,
    "polarity": None,
    "project": None,
    "group": None,
    "submitter": None,
}

default_ann_filter = {
    "fdrLevel": 0.1,
    "database": 'HMDB-v4',
    "offSample": None,
    "hasChemMod": False,
    "hasHiddenAdduct": False,
    "hasNeutralLoss": False,
    "colocalizationAlgo": None,
    "colocalizedWith": None,
}


def convert_url_to_filter_args(url):
    res = urlparse(url)
    query_args = {k: v[0] for k, v in parse_qs(res.query).items()}
    logger.info(f'Query args: {query_args}')

    filter_args = {
        filter_field: query_args[query_field]
        for query_field, filter_field in filter_field_name_mapping.items()
        if query_field in query_args
    }

    filter_args = {
        field: filter_field_value_preprocess.get(field, lambda x: x)(value)
        for field, value in filter_args.items()
    }
    logger.info(f'Filter args: {filter_args}')

    ignored_query_args = [arg for arg in query_args if arg not in filter_field_name_mapping]
    logger.info(f'Ignored query args: {ignored_query_args}')

    return filter_args


def fetch_graphql_res(filter_args):
    unknown_fields = (
        set(filter_args.keys()) - set(default_ds_filter.keys()) - set(default_ann_filter.keys())
    )
    assert not unknown_fields, unknown_fields

    ds_filter = {
        field: filter_args.get(field, default) for field, default in default_ds_filter.items()
    }
    logger.info(f'Dataset filter: {ds_filter}')

    ann_filter = {
        field: filter_args.get(field, default) for field, default in default_ann_filter.items()
    }
    logger.info(f'Annotation filter: {ann_filter}')

    if ann_filter.get('colocalizedWith', None):
        coloc_filter = {
            'colocalizationAlgo': None,
            'colocalizedWith': ann_filter['colocalizedWith'],
            'database': ann_filter['database'],
            'fdrLevel': ann_filter['fdrLevel'],
        }
    else:
        coloc_filter = None

    config = get_config('https://metaspace2020.eu')
    client = GraphQLClient(config)
    resp = client.countAnnotations(annotationFilter=ann_filter, datasetFilter=ds_filter)
    logger.info(f"{resp['countAnnotations']} annotations matched the filters. Downloading...")

    return client.getAnnotations(
        datasetFilter=ds_filter, annotationFilter=ann_filter, colocFilter=coloc_filter
    )


def convert_to_dfs(graphql_res):
    logger.info(f'Converting GraphQL response to dataframes')
    anns, mols = [], []
    for row in graphql_res:
        ann_doc = {
            'formula': row['sumFormula'],
            'fdr': row['fdrLevel'],
            'ds_id': row['dataset']['id'],
            'coloc_coeff': row['colocalizationCoeff'],
        }
        anns.append(ann_doc)

        for mol in row['possibleCompounds']:
            mol_doc = {
                'formula': row['sumFormula'],
                'id': mol['information'][0]['databaseId'],
                'molecule': mol['name'],
                'database': mol['information'][0]['database'],
            }
            mols.append(mol_doc)

    ann_df = pd.DataFrame(anns)
    mol_df = pd.DataFrame(mols).drop_duplicates()
    logger.info(f'Annotations dataframe: {ann_df.shape}')
    logger.info(f'Molecules dataframe: {mol_df.shape}')
    return ann_df, mol_df


def filter_ann_df(ann_df, coloc_thr=None):
    if coloc_thr and 'coloc_coeff' in ann_df.columns:
        ann_df = ann_df[ann_df.coloc_coeff > coloc_thr]
        logger.info(
            f'Annotations dataframe after filtering (coloc_thr={coloc_thr}): {ann_df.shape}'
        )
    return ann_df


def calculate_ann_stat(ann_df):
    if not ann_df.size:
        return pd.DataFrame()

    logger.info(f'Calculating statistics on annotations dataframe')
    ann_stat_df = (
        ann_df.groupby(['formula', 'fdr'])
        .ds_id.count()
        .reset_index()
        .rename({'ds_id': 'ds_n'}, axis=1)
    )
    ann_stat_df = (
        pd.pivot_table(ann_stat_df, values='ds_n', index='formula', columns='fdr')
        .fillna(0)
        .astype(int)
        .reset_index()
        .rename({fdr_: f'fdr_{fdr_}_ds_n' for fdr_ in [0.05, 0.1, 0.2, 0.5]}, axis=1)
    )
    logger.info(f'Annotation statistics dataframe: {ann_stat_df.shape}')
    return ann_stat_df


def export_molecules(ann_stat_df, mol_df, path):
    logger.info(f'Exporting molecules stats and list of molecules to {path}')
    if ann_stat_df.size and mol_df.size:
        mol_export_df = pd.merge(ann_stat_df, mol_df).sort_values(by='id')

        export_path = Path(path)
        mol_export_df.to_csv(
            export_path / 'molecules_stats.csv', index=False, sep='\t', header=True
        )
        mol_export_df.id.to_csv(export_path / 'molecules.csv', index=False, header=False)
    else:
        logger.info(f'Annotation or molecule dataframe is empty. Nothing to export')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run molecule export')
    parser.add_argument('--path', default='.', help='Export path')
    parser.add_argument('--url', type=str, help='Metaspace URL, in double quotes')
    parser.add_argument(
        '--coloc-thr', type=float, default=None, help='Colocalization coeff threshold'
    )
    args = parser.parse_args()

    url = args.url
    path = Path(args.path)
    coloc_thr = args.coloc_thr

    init_logger(logging.INFO)

    filter_args = convert_url_to_filter_args(url)
    graphql_res = fetch_graphql_res(filter_args)
    ann_df, mol_df = convert_to_dfs(graphql_res)
    ann_df = filter_ann_df(ann_df, coloc_thr)
    ann_stat_df = calculate_ann_stat(ann_df)
    export_molecules(ann_stat_df, mol_df, path)
