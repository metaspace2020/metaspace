import logging
import re
from io import StringIO
from pathlib import Path
from typing import List, Iterable
from datetime import datetime

import pandas as pd
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

from sm.engine.config import SMConfig
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError
from sm.engine.storage import get_s3_bucket
from sm.engine.util import split_s3_path

logger = logging.getLogger('engine')


class MalformedCSV(SMError):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class BadData(SMError):
    def __init__(self, message, *errors):
        super().__init__(message, *errors)
        self.message = message
        self.errors = errors


class EnrichmentDB:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        name: str,
    ):
        self.id = id
        self.name = name
        self._sm_config = SMConfig.get_conf()

    def __repr__(self):
        return '<{}>'.format(self.name)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
        }


def create(
    name: str = None,
) -> EnrichmentDB:
    with transaction_context():
        enrichment_db_insert = (
            'INSERT INTO enrichment_db '
            '   (name) '
            'values (%s) RETURNING id'
        )
        # pylint: disable=unbalanced-tuple-unpacking
        (enrichment_db_id,) = DB().insert_return(
            enrichment_db_insert,
            rows=[
                (
                    name,
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

        enrichment_db_update = 'UPDATE enrichment_db SET {} WHERE id = %s'.format(', '.join(update_fields))
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


def find_by_name(name: str) -> EnrichmentDB:
    """Find enrichment database by name."""

    data = DB().select_one_with_fields(
        'SELECT id, name FROM enrichment_db WHERE name = %s',
        params=(name,),
    )

    if not data:
        raise SMError(f'EnrichmentDB not found: {name}')
    return EnrichmentDB(**data)