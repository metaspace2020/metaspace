import logging
from datetime import datetime
from sm.engine.config import SMConfig
from sm.engine.db import DB, transaction_context

logger = logging.getLogger('engine')


class DatasetEnrichment:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        dataset_id: str,
        enrichment_db_id: int,
        molecular_db_id: int,
        processing_dt: datetime,
    ):
        self.id = id
        self.dataset_id = dataset_id
        self.enrichment_db_id = enrichment_db_id
        self.molecular_db_id = molecular_db_id
        self.processing_dt = processing_dt
        self._sm_config = SMConfig.get_conf()

    def __repr__(self):
        return '{}'.format(self.__dict__)

    def to_dict(self):
        return {
            'id': self.id,
            'dataset_id': self.dataset_id,
            'enrichment_db_id': self.enrichment_db_id,
            'molecular_db_id': self.molecular_db_id,
            'processing_dt': self.processing_dt,
        }


def create(
    dataset_id: str, enrichment_db_id: int, molecular_db_id: int, processing_dt: datetime
) -> int:
    with transaction_context():
        enrichment_db_insert = (
            'INSERT INTO dataset_enrichment (dataset_id, enrichment_db_id, '
            'molecular_db_id, processing_dt) values '
            '(%s, %s, %s, %s) RETURNING id'
        )
        # pylint: disable=unbalanced-tuple-unpacking
        (enrichment_db_id,) = DB().insert_return(
            enrichment_db_insert,
            rows=[
                (
                    dataset_id,
                    enrichment_db_id,
                    molecular_db_id,
                    processing_dt,
                )
            ],
        )
        return enrichment_db_id


# pylint: disable=redefined-builtin
def delete_by_ds_id(dataset_id: str):
    DB().alter('DELETE FROM dataset_enrichment WHERE dataset_id = %s', params=(dataset_id,))
