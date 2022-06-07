import logging
from typing import Any, Union, TypedDict
from datetime import datetime
from sm.engine import enrichment_bootstrap
from sm.engine import dataset_enrichment

logger = logging.getLogger('engine')


class DatasetEnrichment(TypedDict, total=False):
    ds_id: str  # required
    bootstrap_data: Any  # required
    error: Union[str, None]


def add_enrichment(enrichment: DatasetEnrichment, moldb_id: int, annotations: Any):
    """Add enrichment bootstrap data"""

    ds_id = enrichment['ds_id']
    logger.debug(f'Inserting bootstrap for dataset {ds_id} and database {moldb_id}')

    for _, row in enrichment['bootstrap_data'].iterrows():
        # get annotation id
        annotation = [
            x for x in annotations if x['formula'] + x['adduct'] == row['formula_adduct']
        ][0]
        enrichment_bootstrap.create(
            scenario=row['scenario'],
            formula_adduct=row['formula_adduct'],
            fdr=row['fdr'],
            dataset_id=ds_id,
            annotation_id=annotation['id'],
            enrichment_db_molecule_mapping_id=row['enrichment_db_molecule_mapping_id'],
        )
    logger.debug('Bootstrap inserted')
    logger.debug(f'Inserting enrichment for dataset {ds_id}')

    dataset_enrichment.create(
        dataset_id=ds_id,
        enrichment_db_id=1,
        molecular_db_id=moldb_id,
        processing_dt=datetime.now(),
    )
    logger.debug('Enrichment inserted')


def delete_ds_enrichments(ds_id: str):
    """Delete asssociated enrichment bootstrap"""

    enrichment_bootstrap.delete_by_ds_id(ds_id)
    dataset_enrichment.delete_by_ds_id(ds_id)
