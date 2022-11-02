import logging

from sm.engine.config import SMConfig
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError

logger = logging.getLogger('engine')


class EnrichmentBootstrap:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        scenario: str,
        formula_adduct: str,
        fdr: str,
        dataset_id: str,
        annotation_id: str,
        enrichment_db_molecule_mapping_id: str,
    ):
        self.id = id
        self.scenario = scenario
        self.formula_adduct = formula_adduct
        self.fdr = fdr
        self.dataset_id = dataset_id
        self.annotation_id = annotation_id
        self.enrichment_db_molecule_mapping_id = enrichment_db_molecule_mapping_id
        self._sm_config = SMConfig.get_conf()

    def __repr__(self):
        return '{}'.format(self.__dict__)

    def to_dict(self):
        return {
            'id': self.id,
            'scenario': self.scenario,
            'formula_adduct': self.formula_adduct,
            'fdr': self.fdr,
            'dataset_id': self.dataset_id,
            'annotation_id': self.annotation_id,
            'enrichment_db_molecule_mapping_id': self.enrichment_db_molecule_mapping_id,
        }


def create(
    scenario: str,
    formula_adduct: str,
    fdr: str,
    dataset_id: str,
    annotation_id: str,
    enrichment_db_molecule_mapping_id: str,
) -> EnrichmentBootstrap:
    with transaction_context():
        enrichment_db_insert = (
            'INSERT INTO enrichment_bootstrap '
            '   (scenario, formula_adduct, fdr, dataset_id, '
            ' enrichment_db_molecule_mapping_id, annotation_id) '
            'values (%s, %s, %s, %s, %s, %s) RETURNING id'
        )
        # pylint: disable=unbalanced-tuple-unpacking
        DB().insert_return(
            enrichment_db_insert,
            rows=[
                (
                    scenario,
                    formula_adduct,
                    fdr,
                    dataset_id,
                    enrichment_db_molecule_mapping_id,
                    annotation_id,
                )
            ],
        )


# pylint: disable=redefined-builtin
def find_by_id(id: int) -> EnrichmentBootstrap:
    """Find enrichment database by id."""

    data = DB().select_one_with_fields(
        'SELECT scenario, formula_adduct, fdr, dataset_id, '
        ' enrichment_db_molecule_mapping_id, annotation_id '
        'FROM enrichment_bootstrap WHERE id = %s',
        params=(id,),
    )
    if not data:
        raise SMError(f'EnrichmentDB not found: {id}')
    return EnrichmentBootstrap(**data)


# pylint: disable=redefined-builtin
def delete_by_ds_id(dataset_id: str):
    DB().alter('DELETE FROM enrichment_bootstrap WHERE dataset_id = %s', params=(dataset_id,))
