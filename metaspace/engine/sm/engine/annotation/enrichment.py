import logging
from typing import Any, Union, TypedDict
from sm.engine import enrichment_bootstrap

logger = logging.getLogger('engine')


class DatasetEnrichment(TypedDict, total=False):
    ds_id: str  # required
    bootstrap_data: Any  # required
    error: Union[str, None]


def add_enrichment(enrichment: DatasetEnrichment, annotations: Any):
    """Add enrichment bootstrap data"""

    ds_id = enrichment['ds_id']
    for _, row in enrichment['bootstrap_data'].iterrows():
        # get annotation id
        annotation = [x for x in annotations if x['formula'] + x['adduct'] == row['formula_adduct']][0]
        enrichment_bootstrap.create(scenario=row['scenario'],
                                    formula_adduct=row['formula_adduct'],
                                    fdr=row['fdr'],
                                    dataset_id=ds_id,
                                    annotation_id=annotation['id'],
                                    enrichment_db_molecule_mapping_id=
                                    row['enrichment_db_molecule_mapping_id'])


def delete_ds_enrichments(ds_id: str):
    """Delete asssociated enrichment bootstrap"""

    enrichment_bootstrap.delete_by_ds_id(ds_id)
