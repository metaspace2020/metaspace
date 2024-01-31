import logging
from datetime import datetime

import pandas as pd

from sm.engine.db import DB

logger = logging.getLogger('engine')


ENRICHMENT_BOOTSTRAP_DEL = 'DELETE FROM enrichment_bootstrap WHERE dataset_id = %s'
ENRICHMENT_BOOTSTRAP_INS = (
    'INSERT INTO enrichment_bootstrap '
    ' (scenario, formula_adduct, fdr, dataset_id, '
    ' annotation_id, enrichment_db_molecule_mapping_id) '
    'values (%s, %s, %s, %s, %s, %s)'
)

DATASET_ENRICHMENT_DEL = 'DELETE FROM dataset_enrichment WHERE dataset_id = %s'
DATASET_ENRICHMENT_INS = (
    'INSERT INTO dataset_enrichment (dataset_id, enrichment_db_id, '
    'molecular_db_id, processing_dt) values (%s, %s, %s, %s)'
)


def add_enrichment(
    ds_id: str, moldb_id: int, bootstrap_data: pd.DataFrame, annotations: list, db: DB
):
    """Add enrichment bootstrap data"""
    logger.debug(f'Inserting bootstrap for dataset {ds_id} and database {moldb_id}')
    logger.debug(f'Size of annotations is {len(annotations)}')
    logger.debug(f'Type {type(annotations)}, type of element {type(annotations[0])}')
    logger.debug(annotations[0])

    data = []
    annotations_hash = {f'{a["formula"]}{a["adduct"]}': a['id'] for a in annotations}
    for _, row in bootstrap_data.iterrows():
        annotation_id = annotations_hash.get(row['formula_adduct'])
        if annotation_id:
            data.append(
                (
                    row['scenario'],
                    row['formula_adduct'],
                    row['fdr'],
                    ds_id,
                    annotation_id,
                    row['enrichment_db_molecule_mapping_id'],
                )
            )

    db.insert(ENRICHMENT_BOOTSTRAP_INS, rows=data)
    logger.debug('Bootstrap inserted')

    logger.debug(f'Inserting enrichment for dataset {ds_id}')
    db.insert(DATASET_ENRICHMENT_INS, rows=[(ds_id, 1, moldb_id, datetime.now())])
    logger.debug('Enrichment inserted')


def delete_ds_enrichments(ds_id: str, db):
    """Delete associated enrichment bootstrap"""

    db.alter(ENRICHMENT_BOOTSTRAP_DEL, params=(ds_id,))
    db.alter(DATASET_ENRICHMENT_DEL, params=(ds_id,))
