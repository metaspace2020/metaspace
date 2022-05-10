import logging
import re
from io import StringIO
from pathlib import Path
from typing import List, Iterable
from datetime import datetime
import json

import pandas as pd
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

from sm.engine.config import SMConfig
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError
from sm.engine.storage import get_s3_bucket
from sm.engine.util import split_s3_path

from sm.engine import enrichment_term
from sm.engine import molecular_db
from sm.engine.ion_mapping import find_mol_by_name

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


class EnrichmentDBMoleculeMapping:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        molecule_enriched_name: str,
        enrichment_term_id: int,
        molecular_db_id: int,
    ):
        self.id = id
        self.molecule_enriched_name = molecule_enriched_name
        self.enrichment_term_id = enrichment_term_id
        self.molecular_db_id = molecular_db_id

    def __repr__(self):
        return '<{}>'.format(self.name)

    def to_dict(self):
        return {
            'id': self.id,
            'molecule_enriched_name': self.molecule_enriched_name,
            'enrichment_term_id': self.enrichment_term_id,
            'molecular_db_id': self.molecular_db_id,
        }


def create(
    enrichment_db_id: int = None,
    db_name: str = None,
    file_path: str = None,
) -> EnrichmentDBMoleculeMapping:
    with transaction_context():
        logger.info(f'Received request: {db_name}')
        read_json_file(db_name, enrichment_db_id, file_path)
        return db_name

def read_json_file(db_name, enrichment_db_id, file_path):
    try:
        if re.findall(r'^s3a?://', file_path):
            bucket_name, key = split_s3_path(file_path)
            sm_config = SMConfig.get_conf()
            buffer = get_s3_bucket(bucket_name, sm_config).Object(key).get()['Body']
        else:
            buffer = Path(file_path).open()
        translate_json = json.load(buffer)
    except ValueError as e:
        raise MalformedCSV(f'Malformed CSV: {e}') from e

    df = pd.DataFrame(columns=['molecule_enriched_name', 'formula', 'enrichment_term_id', 'molecule_id'
        , 'molecular_db_id'])
    counter = 0
    for enrichment_id in translate_json.keys():
        if enrichment_id != 'all':
            term = enrichment_term.find_by_enrichment_id(enrichment_id, enrichment_db_id)
            moldb = molecular_db.find_by_name(db_name)
            enrichment_names = translate_json[enrichment_id]
            for name in enrichment_names:
                mol = find_mol_by_name(DB(), moldb.id, name)
                df.loc[counter] = [name, mol[3], term.id,  mol[0], moldb.id]
                counter = counter + 1
                if counter > 100:
                    break
    logger.info(f'Received request: {len(df)}')
    _import_mappings(df)

    return translate_json

def _import_mappings(mappings_df):
    logger.info(f'importing {len(mappings_df)} mappings')

    columns = ['molecule_enriched_name', 'formula', 'enrichment_term_id', 'molecule_id'
        , 'molecular_db_id']
    buffer = StringIO()
    mappings_df[columns].to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='enrichment_db_molecule_mapping', columns=columns)
    logger.info(f'inserted {len(mappings_df)} mappings')

# def get_term_count(term_id: str) -> int:
#     """Find enrichment database by id."""
#
#     data = DB().select_with_fields(
#         'SELECT COUNT(*) FROM enrichment_db_molecule_mapping WHERE id = %s', params=(id,)
#     )
#     if not data:
#         raise SMError(f'EnrichmentDB not found: {id}')
#     return EnrichmentDB(**data)


