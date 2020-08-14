import logging
from io import StringIO
from typing import List, Iterable
from datetime import datetime

import pandas as pd
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError

logger = logging.getLogger('engine')


class MalformedCSV(Exception):
    def __init__(self, message, *errors):
        full_message = '\n'.join([str(m) for m in (message,) + errors])
        super().__init__(full_message)


class MolecularDB:
    """Represents a molecular database to search against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self,
        id: int = None,
        name: str = None,
        version: str = None,
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
    for row in df.itertuples():
        try:
            if '.' in row.formula:
                raise InvalidFormulaError('"." symbol not supported')
            parseSumFormula(row.formula)
        except Exception as e:
            csv_file_line_n = row.Index + 2
            errors.append({'line': csv_file_line_n, 'formula': row.formula, 'error': repr(e)})
    return errors


def _import_molecules_from_file(moldb, file_path, targeted_threshold):
    moldb_df = pd.read_csv(file_path, sep='\t')

    if moldb_df.empty:
        raise MalformedCSV('No data rows found')

    required_columns = {'id', 'name', 'formula'}
    if not required_columns.issubset(set(moldb_df.columns)):
        raise MalformedCSV(
            f'Missing columns. Provided: {moldb_df.columns.to_list()} Required: {required_columns}'
        )

    logger.info(f'{moldb}: importing {len(moldb_df)} molecules')
    parsing_errors = _validate_moldb_df(moldb_df)
    if parsing_errors:
        raise MalformedCSV('Failed to parse some formulas', *parsing_errors)

    moldb_df.rename({'id': 'mol_id', 'name': 'mol_name'}, axis='columns', inplace=True)
    moldb_df['moldb_id'] = int(moldb.id)

    columns = ['moldb_id', 'mol_id', 'mol_name', 'formula']
    buffer = StringIO()
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
    is_public: bool = True,
    description: str = None,
    full_name: str = None,
    link: str = None,
    citation: str = None,
) -> MolecularDB:
    with transaction_context():
        moldb_insert = (
            'INSERT INTO molecular_db '
            '   (name, version, created_dt, group_id, is_public, '
            '   description, full_name, link, citation) '
            'values (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id'
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
                    is_public,
                    description,
                    full_name,
                    link,
                    citation,
                )
            ],
        )
        moldb = find_by_id(moldb_id)
        _import_molecules_from_file(moldb, file_path, targeted_threshold=1000)
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


def find_by_name(name: str) -> MolecularDB:
    """Find database by name."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted, group_id FROM molecular_db WHERE name = %s',
        params=(name,),
    )
    if not data:
        raise SMError(f'MolecularDB not found: {name}')
    return MolecularDB(**data)


def find_default() -> List[MolecularDB]:
    data = DB().select_one_with_fields(
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
