import logging
from io import StringIO

import pandas as pd
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from sm.engine.db import DB, transaction_context
from sm.engine.errors import SMError

MOLDB_INS = (
    'INSERT INTO molecular_db '
    '   (name, version, group_id, public, description, full_name, link, citation) '
    'values (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id'
)
MOLDB_UPD_TMPL = 'UPDATE molecular_db SET {} WHERE id = %s'
MOLDB_DEL = 'DELETE FROM molecular_db WHERE id = %s'

logger = logging.getLogger('engine')


class MalformedCSV(Exception):
    def __init__(self, message, *errors):
        full_message = '\n'.join([str(m) for m in (message,) + errors])
        super().__init__(full_message)


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


def _import_molecules_from_file(moldb, file_path, targeted_threshold=1000):
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


def create(
    name=None,
    version=None,
    file_path=None,
    group_id=None,
    public=True,
    description=None,
    full_name=None,
    link=None,
    citation=None,
):
    with transaction_context():
        # pylint: disable=unbalanced-tuple-unpacking
        (moldb_id,) = DB().insert_return(
            MOLDB_INS,
            rows=[(name, version, group_id, public, description, full_name, link, citation)],
        )
        moldb = find_by_id(moldb_id)
        _import_molecules_from_file(moldb, file_path)
        return moldb


def delete(moldb_id):
    DB().alter(MOLDB_DEL, params=(moldb_id,))


def update(
    moldb_id, archived=None, description=None, full_name=None, link=None, citation=None,
):
    assert archived is not None or description or full_name or link or citation

    kwargs = {k: v for k, v in locals().items() if v is not None}
    kwargs.pop('moldb_id')

    update_fields = [f'{field} = %s' for field in kwargs.keys()]
    update_values = list(kwargs.values())
    update_values.append(moldb_id)
    DB().alter(MOLDB_UPD_TMPL.format(', '.join(update_fields)), params=update_values)

    return find_by_id(moldb_id)


# pylint: disable=redefined-builtin
def find_by_id(id):
    """Find database by id."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted FROM molecular_db WHERE id = %s', params=(id,)
    )
    if not data:
        raise SMError(f'MolecularDB not found: {id}')
    return MolecularDB(**data)


def find_by_ids(ids):
    """Find multiple databases by ids."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted FROM molecular_db WHERE id IN %s', params=(ids,)
    )
    return [MolecularDB(**row) for row in data]


def find_by_name(name):
    """Find database by name."""

    data = DB().select_one_with_fields(
        'SELECT id, name, version, targeted FROM molecular_db WHERE name = %s', params=(name,)
    )
    if not data:
        raise SMError(f'MolecularDB not found: {name}')
    return MolecularDB(**data)


def fetch_molecules(moldb_id):
    """Fetch all database molecules as a DataFrame.

    Returns:
        pd.DataFrame
    """
    data = DB().select_with_fields(
        'SELECT mol_id, mol_name, formula FROM molecule m WHERE m.moldb_id = %s', params=(moldb_id,)
    )
    return pd.DataFrame(data)


def fetch_formulas(moldb_id):
    """Fetch all unique database formulas.

    Returns:
        List[str]
    """

    data = DB().select(
        'SELECT DISTINCT formula FROM molecule m WHERE m.moldb_id = %s', params=(moldb_id,)
    )
    return [row[0] for row in data]


class MolecularDB:
    """Represents a molecular database to search against."""

    # pylint: disable=redefined-builtin
    def __init__(
        self, id: int = None, name: str = None, version: str = None, targeted: bool = None
    ):
        self.id = id
        self.name = name
        self.version = version
        self.targeted = targeted

    def __repr__(self):
        return '<{}:{}>'.format(self.name, self.version)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'version': self.version}
