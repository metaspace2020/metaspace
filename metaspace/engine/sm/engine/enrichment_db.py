import logging
from typing import List, Iterable


from sm.engine.config import SMConfig
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError

logger = logging.getLogger('engine')


class EnrichmentDB:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        name: str,
        mol_type: str,
        category: str,
        sub_category: str,
    ):
        self.id = id
        self.name = name
        self.mol_type = mol_type
        self.category = category
        self.sub_category = sub_category
        self._sm_config = SMConfig.get_conf()

    def __repr__(self):
        return '<{}:{}>'.format(self.name, self.mol_type)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'mol_type': self.mol_type,
            'category': self.category,
            'sub_category': self.sub_category,
        }


def create(
    name: str = None,
    mol_type: str = None,
    category: str = None,
    sub_category: str = None,
) -> EnrichmentDB:
    with transaction_context():
        enrichment_db_insert = (
            'INSERT INTO enrichment_db (name, mol_type, category, sub_category) values '
            ' (%s,%s,%s,%s) RETURNING id'
        )
        # pylint: disable=unbalanced-tuple-unpacking
        (enrichment_db_id,) = DB().insert_return(
            enrichment_db_insert,
            rows=[
                (
                    name,
                    mol_type,
                    category,
                    sub_category,
                )
            ],
        )
        enrichment_db = find_by_id(enrichment_db_id)
        return enrichment_db


def delete(enrichment_db_id: int):
    DB().alter('DELETE FROM enrichment_db WHERE id = %s', params=(enrichment_db_id,))


# pylint: disable=unused-argument
def update(
    enrichment_db_id: int,
    name: str = None,
) -> EnrichmentDB:
    kwargs = {k: v for k, v in locals().items() if v is not None}
    kwargs.pop('enrichment_db_id')

    if kwargs:
        update_fields = [f'{field} = %s' for field in kwargs.keys()]
        update_values = list(kwargs.values())

        enrichment_db_update = 'UPDATE enrichment_db SET {} WHERE id = %s'.format(
            ', '.join(update_fields)
        )
        DB().alter(enrichment_db_update, params=[*update_values, enrichment_db_id])

    return find_by_id(enrichment_db_id)


# pylint: disable=redefined-builtin
def find_by_id(id: int) -> EnrichmentDB:
    """Find enrichment database by id."""

    data = DB().select_one_with_fields(
        'SELECT id, name FROM enrichment_db WHERE id = %s', params=(id,)
    )
    if not data:
        raise SMError(f'EnrichmentDB not found: {id}')
    return EnrichmentDB(**data)


def find_by_ids(ids: Iterable[int]) -> List[EnrichmentDB]:
    """Find multiple enrichment databases by ids."""

    data = DB().select_with_fields(
        'SELECT id, name FROM enrichment_db WHERE id = ANY (%s)',
        params=(list(ids),),
    )
    return [EnrichmentDB(**row) for row in data]


def find_by_name_and_type(name: str, mol_type: str) -> EnrichmentDB:
    """Find enrichment database by name."""

    data = DB().select_one_with_fields(
        'SELECT id, name, mol_type, category, sub_category FROM enrichment_db WHERE '
        ' name = %s and mol_type = %s',
        params=(
            name,
            mol_type,
        ),
    )

    if not data:
        raise SMError(f'EnrichmentDB not found: {name} {mol_type}')
    return EnrichmentDB(**data)
