import logging
from typing import Optional, Any, Union, List, TypedDict
from sm.engine import enrichment_bootstrap


logger = logging.getLogger('engine')


class DatasetEnrichment(TypedDict, total=False):
    ds_id: str  # required
    bootstrap_data: Any # required
    error: Union[str, None]


def add_enrichment(enrichment: DatasetEnrichment):
    """Upserts dataset diagnostics, overwriting existing values with the same ds_id, job_id, type"""
    # Validate input, as postgres can't enforce the JSON columns have the correct schema,
    # and many places (graphql, python client, etc.) rely on these structures.

    ds_id = enrichment['ds_id']
    enrichment_bootstrap.delete_by_ds_id(ds_id)
    for index, row in enrichment['bootstrap_data'].iterrows():
        enrichment_bootstrap.create(scenario=row['scenario'], formula_adduct=row['formula_adduct'],
                                    fdr=row['fdr'], dataset_id=ds_id,
                                    enrichment_db_molecule_mapping_id=row['enrichment_db_molecule_mapping_id'])