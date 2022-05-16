import logging
import re
from io import StringIO
from pathlib import Path
from typing import List, Optional
import json

import pandas as pd

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


class EnrichmentDBMoleculeMapping:
    """Represents an enrichment database to make enrichment against."""

    # pylint: disable=redefined-builtin
    def __init__(
            self,
            id: int,
            molecule_enriched_name: str,
            formula: str,
            enrichment_term_id: int,
            molecule_id: int,
            molecular_db_id: int,
    ):
        self.id = id
        self.molecule_enriched_name = molecule_enriched_name
        self.formula = formula
        self.enrichment_term_id = enrichment_term_id
        self.molecule_id = molecule_id
        self.molecular_db_id = molecular_db_id

    def __repr__(self):
        return '{}'.format(self.__dict__)

    def to_dict(self):
        return {
            'id': self.id,
            'molecule_enriched_name': self.molecule_enriched_name,
            'formula': self.formula,
            'enrichment_term_id': self.enrichment_term_id,
            'molecule_id': self.molecule_id,
            'molecular_db_id': self.molecular_db_id,
        }


def create(
        enrichment_db_id: int = None,
        db_name: str = None,
        db_version: str = None,
        file_path: str = None,
        filter_file_path: str = None,
) -> Optional[str]:
    with transaction_context():
        logger.info(f'Received request: {db_name}')
        read_json_file(db_name, db_version, enrichment_db_id, file_path, filter_file_path)
        return db_name


def read_json_file(db_name, db_version, enrichment_db_id, file_path, filter_file_path):
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

    df = pd.DataFrame(columns=['molecule_enriched_name', 'formula', 'enrichment_term_id',
                               'molecule_id', 'molecular_db_id'])
    filter_terms = pd.read_csv(filter_file_path)
    counter = 0
    moldb = molecular_db.find_by_name_version(db_name, db_version)

    for enrichment_id in translate_json.keys():
        if enrichment_id != 'all' and enrichment_id in filter_terms['LION_ID'].values:
            logger.info(f'Adding term: {enrichment_id}')
            term = enrichment_term.find_by_enrichment_id(enrichment_id, enrichment_db_id)
            enrichment_names = translate_json[enrichment_id]
            idx = 0
            for name in enrichment_names:
                logger.info(f'Adding term: {enrichment_id} index: {idx}')
                try:
                    mol = find_mol_by_name(DB(), moldb.id, name)
                    if mol and mol[3] and mol[0]:
                        df.loc[counter] = [name, mol[3], term.id, mol[0], moldb.id]
                        counter = counter + 1
                        idx = idx + 1
                    if idx > 300:
                        break
                except SMError:
                    logger.info(f'Term: {enrichment_id} name: {name} not found on database')
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


def get_mappings_by_mol_db_id(moldb_id: str) -> List[EnrichmentDBMoleculeMapping]:
    """Find enrichment database by id."""

    data = DB().select_with_fields(
        'SELECT * FROM enrichment_db_molecule_mapping WHERE molecular_db_id = %s', params=(moldb_id)
    )
    if not data:
        raise SMError(f'EnrichmentDBMoleculeMapping not found: {moldb_id}')
    return [EnrichmentDBMoleculeMapping(**row) for row in data]


def get_mappings_by_formula(formula: str, moldb_id: str) -> List[EnrichmentDBMoleculeMapping]:
    """Find enrichment database by id."""

    data = DB().select_with_fields(
        'SELECT * FROM enrichment_db_molecule_mapping WHERE formula = %s and molecular_db_id = %s',
        params=(formula, moldb_id)
    )
    if not data:
        raise SMError(f'EnrichmentDBMoleculeMapping not found: {moldb_id}')
    return[EnrichmentDBMoleculeMapping(**row) for row in data]
