import logging
import re
from io import StringIO
from pathlib import Path
from typing import List

import pandas as pd

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


class EnrichmentTerm:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        enrichment_id: str,
        enrichment_name: str,
        enrichment_db_id: int,
    ):
        self.id = id
        self.enrichment_id = enrichment_id
        self.enrichment_name = enrichment_name
        self.enrichment_db_id = enrichment_db_id

    def __repr__(self):
        return '<{}>'.format(self.enrichment_id)

    def to_dict(self):
        return {
            'id': self.id,
            'enrichment_id': self.enrichment_id,
            'enrichment_name': self.enrichment_name,
            'enrichment_db_id': self.enrichment_db_id,
        }


def create(
    enrichment_db_id: int = None,
    file_path: str = None,
) -> EnrichmentTerm:
    with transaction_context():
        term_df = read_terms_file(enrichment_db_id, file_path)
        logger.info(f'Received request: {term_df}')
        _import_terms(term_df)
        return term_df


def read_terms_file(enrichment_db_id, file_path):
    try:
        if re.findall(r'^s3a?://', file_path):
            bucket_name, key = split_s3_path(file_path)
            sm_config = SMConfig.get_conf()
            buffer = get_s3_bucket(bucket_name, sm_config).Object(key).get()['Body']
        else:
            buffer = Path(file_path).open()
        term_df = pd.read_csv(buffer, sep=',', dtype=object, na_filter=False)
    except ValueError as e:
        raise MalformedCSV(f'Malformed CSV: {e}') from e

    if term_df.empty:
        raise MalformedCSV('No data rows found')

    required_columns = {'LION_ID', 'LION_name'}
    if not required_columns.issubset(set(term_df.columns)):
        raise MalformedCSV(
            f'Missing columns. Provided: {term_df.columns.to_list()} Required: {required_columns}'
        )

    term_df['enrichment_db_id'] = enrichment_db_id
    term_df.rename(
        {'LION_ID': 'enrichment_id', 'LION_name': 'enrichment_name'}, axis='columns', inplace=True
    )
    return term_df


def _import_terms(term_df):
    logger.info(f'importing {len(term_df)} terms')

    columns = ['enrichment_id', 'enrichment_name', 'enrichment_db_id']
    buffer = StringIO()
    term_df[columns].to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='enrichment_term', columns=columns)
    logger.info(f'inserted {len(term_df)} terms')


# pylint: disable=redefined-builtin
def find_by_enrichment_id(id: str, db_id: int) -> EnrichmentTerm:
    """Find enrichment database by id."""

    data = DB().select_one_with_fields(
        'SELECT id, enrichment_id, enrichment_name, enrichment_db_id FROM enrichment_term '
        'WHERE enrichment_id = %s AND enrichment_db_id = %s',
        params=(id, db_id),
    )
    if not data:
        raise SMError(f'EnrichmentTerm not found: {id}')
    return EnrichmentTerm(**data)


# pylint: disable=redefined-builtin
def find_by_enrichment_db_id(db_id: int) -> List[EnrichmentTerm]:
    """Find enrichment database by enrichment database id."""

    data = DB().select_with_fields(
        'SELECT id, enrichment_id, enrichment_name, enrichment_db_id FROM enrichment_term '
        'WHERE enrichment_db_id = %s',
        params=(db_id),
    )
    if not data:
        raise SMError(f'EnrichmentTerm not found: {id}')
    return [EnrichmentTerm(**row) for row in data]
