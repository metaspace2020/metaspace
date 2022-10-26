import json
import logging
import time
from io import StringIO
from typing import List, Tuple

import pandas as pd

from sm.engine import enrichment_term
from sm.engine import molecular_db
from sm.engine.db import DB
from sm.engine.errors import SMError
from sm.engine.ion_mapping import find_all_mol

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


def read_files(matching_file_path: str, filter_file_path: str) -> Tuple[dict, set]:
    # correspondence file between LION_ID and ion names
    with open(matching_file_path, 'r') as f:
        matching_enrichment_id_names = json.load(f)
        matching_enrichment_id_names.pop('all')  # TODO: delete from an original file

    # correspondence file between ? and ?
    df = pd.read_csv(filter_file_path)
    filter_terms = set(df['LION_ID'].values)

    return matching_enrichment_id_names, filter_terms


def preparing_data(
    db_name: str,
    db_version: str,
    enrichment_db_id: int,
    matching_enrichment_id_names: dict,
    filter_terms: set,
) -> pd.DataFrame:
    moldb = molecular_db.find_by_name_version(db_name, db_version)
    mol_from_db = {
        mol[2]: {'id': mol[0], 'mol_id': mol[1], 'mol_name': mol[2], 'formula': mol[3]}
        for mol in find_all_mol(DB(), moldb.id)
    }

    data = []
    start = time.time()
    for enrichment_id, enrichment_names in matching_enrichment_id_names.items():
        if enrichment_id in filter_terms:
            logger.info(f'Adding term: {enrichment_id}')
            term = enrichment_term.find_by_enrichment_id(enrichment_id, enrichment_db_id)

            for name in enrichment_names:
                mol = mol_from_db.get(name)
                # TODO: why we check mol.get('id') and mol.get('formula')
                if mol and mol.get('id') and mol.get('formula'):
                    data.append((name, mol['formula'], term.id, mol['id'], moldb.id))
                else:
                    logger.info(f'Term: {enrichment_id} name: {name} not found on database')

    columns = [
        'molecule_enriched_name',
        'formula',
        'enrichment_term_id',
        'molecule_id',
        'molecular_db_id',
    ]
    print(f'Time is {int(time.time() - start)} sec')
    return pd.DataFrame.from_records(data, columns=columns)


def import_mappings(df: pd.DataFrame) -> None:
    logger.info(f'Importing {len(df)} mappings')
    buffer = StringIO()
    df.to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='enrichment_db_molecule_mapping', columns=list(df.columns))
    logger.info(f'Inserted {len(df)} mappings')


def create(
    enrichment_db_id: int,
    db_name: str,
    db_version: str,
    file_path: str,
    filter_file_path: str,
) -> None:
    logger.info(f'Received request: {db_name}')
    matching_enrichment_id_names, filter_terms = read_files(file_path, filter_file_path)
    df = preparing_data(
        db_name, db_version, enrichment_db_id, matching_enrichment_id_names, filter_terms
    )
    import_mappings(df)


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
        'SELECT * FROM enrichment_db_molecule_mapping WHERE molecular_db_id = %s and formula = %s',
        params=(moldb_id, formula),
    )
    if not data:
        raise SMError(f'EnrichmentDBMoleculeMapping not found: {moldb_id}')
    return [EnrichmentDBMoleculeMapping(**row) for row in data]
