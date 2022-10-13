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


class MolecularDB:
    """Represents a molecular database to search against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int,
        name: str,
        version: str,
        targeted: bool = None,
        group_id: str = None,
    ):
        self.id = id
        self.name = name
        self.version = version
        self.targeted = targeted
        self.group_id = group_id

    def __repr__(self):
        return '<{}:{}>'.format(self.name, self.version)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'version': self.version,
            'group_id': self.group_id,
        }


def _validate_moldb_df(df):
    errors = []
    max_value_length = 2500  # based on the max inchi in lipds uploaded
    for idx, row in df.iterrows():
        line_n = idx + 2
        for col in df.columns:
            if not row[col] or row[col].isspace():
                errors.append({'line': line_n, 'row': row.values.tolist(), 'error': 'Empty value'})
            elif len(row[col]) > max_value_length:
                errors.append(
                    {
                        'line': line_n,
                        'row': [row[col]],
                        'error': 'Value exceeded the maximum number ' 'of characters.',
                    }
                )

        try:
            if '.' in row.formula:
                raise InvalidFormulaError('"." symbol not supported')
            parseSumFormula(row.formula)
        except Exception as e:
            errors.append({'line': line_n, 'row': row.values.tolist(), 'error': repr(e)})

    errors.sort(key=lambda d: d['line'])
    return errors


def read_moldb_file(file_path):
    try:
        if re.findall(r'^s3a?://', file_path):
            bucket_name, key = split_s3_path(file_path)
            sm_config = SMConfig.get_conf()
            buffer = get_s3_bucket(bucket_name, sm_config).Object(key).get()['Body']
        else:
            buffer = Path(file_path).open()
        moldb_df = pd.read_csv(buffer, sep='\t', dtype=object, na_filter=False)
    except ValueError as e:
        raise MalformedCSV(f'Malformed CSV: {e}') from e

    if moldb_df.empty:
        raise MalformedCSV('No data rows found')

    required_columns = {'id', 'name', 'formula'}
    if not required_columns.issubset(set(moldb_df.columns)):
        raise MalformedCSV(
            f'Missing columns. Provided: {moldb_df.columns.to_list()} Required: {required_columns}'
        )

    parsing_errors = _validate_moldb_df(moldb_df)
    if parsing_errors:
        raise BadData('Failed to parse some rows', *parsing_errors)

    moldb_df.rename({'id': 'mol_id', 'name': 'mol_name'}, axis='columns', inplace=True)
    return moldb_df


def _import_molecules(moldb, moldb_df, targeted_threshold):
    logger.info(f'{moldb}: importing {len(moldb_df)} molecules')

    columns = ['moldb_id', 'mol_id', 'mol_name', 'formula']
    buffer = StringIO()
    moldb_df = moldb_df.assign(moldb_id=int(moldb.id))
    moldb_df[columns].to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='molecule', columns=columns)
    logger.info(f'{moldb}: inserted {len(moldb_df)} molecules')

    targeted = moldb_df.formula.unique().shape[0] <= targeted_threshold
    DB().alter('UPDATE molecular_db SET targeted = %s WHERE id = %s', params=(targeted, moldb.id))


def create(
    name: str = None,
    version: str = None,
    file_path: str = None,
    group_id: str = None,
    user_id: str = None,
    is_public: bool = True,
    description: str = None,
    full_name: str = None,
    link: str = None,
    citation: str = None,
) -> MolecularDB:
    with transaction_context():
        moldb_insert = (
            'INSERT INTO molecular_db '
            '   (name, version, created_dt, group_id, user_id, is_public, '
            '   description, full_name, link, citation, input_path ) '
            'values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id'
        )
        # pylint: disable=unbalanced-tuple-unpacking
        (moldb_id,) = DB().insert_return(
            moldb_insert,
            rows=[
                (
                    name,
                    version,
                    datetime.now(),
                    group_id,
                    user_id,
                    is_public,
                    description,
                    full_name,
                    link,
                    citation,
                    file_path,
                )
            ],
        )
        moldb = find_by_id(moldb_id)
        moldb_df = read_moldb_file(file_path)
        _import_molecules(moldb, moldb_df, targeted_threshold=1000)
        return moldb


def delete(moldb_id: int):
    DB().alter('DELETE FROM molecular_db WHERE id = %s', params=(moldb_id,))


# pylint: disable=unused-argument
def update(
    moldb_id: int,
    archived: bool = None,
    is_public: bool = None,
    description: str = None,
    full_name: str = None,
    link: str = None,
    citation: str = None,
) -> MolecularDB:
    kwargs = {k: v for k, v in locals().items() if v is not None}
    kwargs.pop('moldb_id')

    if kwargs:
        update_fields = [f'{field} = %s' for field in kwargs.keys()]
        update_values = list(kwargs.values())

        moldb_update = 'UPDATE molecular_db SET {} WHERE id = %s'.format(', '.join(update_fields))
        DB().alter(moldb_update, params=[*update_values, moldb_id])

    return find_by_id(moldb_id)


# pylint: disable=redefined-builtin
def find_by_id(id: int) -> MolecularDB:
    """Find database by id."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db WHERE id = %s', params=(id,)
    )
    if not data:
        raise SMError(f'MolecularDB not found: {id}')
    return MolecularDB(**data)


def find_by_ids(ids: Iterable[int]) -> List[MolecularDB]:
    """Find multiple databases by ids."""

    data = DB().select_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db WHERE id = ANY (%s)',
        params=(list(ids),),
    )
    return [MolecularDB(**row) for row in data]


def find_by_name(name: str, allow_legacy_names=False) -> MolecularDB:
    """Find database by name."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db WHERE name = %s',
        params=(name,),
    )
    if not data and allow_legacy_names:
        data = DB().select_one_with_fields(
            "SELECT id, name, version, targeted, group_id FROM molecular_db "
            "WHERE name || '-' || version = %s",
            params=(name,),
        )
    if not data:
        raise SMError(f'MolecularDB not found: {name}')
    return MolecularDB(**data)


def find_by_name_version(name: str, version: str) -> MolecularDB:
    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db '
        'WHERE name = %s AND version = %s',
        params=(name, version),
    )
    if not data:
        raise SMError(f'MolecularDB not found: {name}')
    return MolecularDB(**data)


def find_default() -> List[MolecularDB]:
    data = DB().select_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db WHERE "default" = TRUE',
    )
    return [MolecularDB(**row) for row in data]


def fetch_molecules(moldb_id: int) -> pd.DataFrame:
    """Fetch all database molecules as a DataFrame."""

    data = DB().select_with_fields(
        'SELECT mol_id, mol_name, formula FROM molecule m WHERE m.moldb_id = %s', params=(moldb_id,)
    )
    return pd.DataFrame(data)


def fetch_formulas(moldb_id: int) -> List[str]:
    """Fetch all unique database formulas."""

    data = DB().select(
        'SELECT DISTINCT formula FROM molecule m WHERE m.moldb_id = %s', params=(moldb_id,)
    )
    return [row[0] for row in data]
