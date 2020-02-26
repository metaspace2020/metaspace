import logging
from io import StringIO

import pandas as pd
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from sm.engine.db import DB
from sm.engine.errors import SMError

logger = logging.getLogger('engine')


class MalformedCSV(Exception):
    def __init__(self, *errors):
        super().__init__()
        self.errors = errors


def validate_moldb_df(df):
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


def import_molecules_from_df(moldb, moldb_df):
    if moldb_df.empty:
        raise MalformedCSV('No data rows found')

    required_columns = {'id', 'name', 'formula'}
    if not required_columns.issubset(set(moldb_df.columns)):
        raise MalformedCSV(
            f'Missing columns. Provided: {moldb_df.columns.to_list()} Required: {required_columns}'
        )

    logger.info(f'{moldb}: importing {len(moldb_df)} molecules')
    parsing_errors = validate_moldb_df(moldb_df)
    if parsing_errors:
        raise MalformedCSV(*parsing_errors)

    moldb_df.rename({'id': 'mol_id', 'name': 'mol_name'}, axis='columns', inplace=True)
    moldb_df['moldb_id'] = int(moldb.id)

    columns = ['moldb_id', 'mol_id', 'mol_name', 'formula']
    buffer = StringIO()
    moldb_df[columns].to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='molecule', columns=columns)
    logger.info(f'{moldb}: inserted {len(moldb_df)} molecules')


class MolecularDB:
    """Represents a molecular database to search against."""

    MOLDB_SEL_BY_ID = 'SELECT id, name, version FROM molecular_db WHERE id = %s'
    MOLDB_SEL_BY_NAME = 'SELECT id, name, version FROM molecular_db WHERE name = %s'
    MOLECULES_SEL_BY_DB = 'SELECT mol_id, mol_name, formula FROM molecule m WHERE m.moldb_id = %s'
    FORMULAS_SEL_BY_DB = 'SELECT DISTINCT formula FROM molecule m WHERE m.moldb_id = %s'

    # pylint: disable=redefined-builtin
    def __init__(self, id=None, name=None):
        """
        Args:
            id (int): Database id
            name (str): Database name
        """
        assert id is not None or name is not None, 'Either id or name should be provided'

        self._db = DB()
        if id is not None:
            data = self._db.select_one_with_fields(self.MOLDB_SEL_BY_ID, params=(id,))
        else:
            data = self._db.select_one_with_fields(self.MOLDB_SEL_BY_NAME, params=(name,))

        if data:
            self.id, self.name, self.version = data['id'], data['name'], data['version']
        else:
            raise SMError(f'MolecularDB not found: {id}, {name}')

    def __repr__(self):
        return '<{}:{}>'.format(self.name, self.version)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'version': self.version}

    @classmethod
    def create(cls, name, version, group_id=None, public=True):
        # pylint: disable=unbalanced-tuple-unpacking
        (moldb_id,) = DB().insert_return(
            "INSERT INTO molecular_db (name, version, group_id, public) "
            "values (%s, %s, %s, %s) RETURNING id",
            rows=[(name, version, group_id, public)],
        )
        return MolecularDB(id=moldb_id)

    @classmethod
    def delete(cls, id):
        DB().alter("DELETE FROM molecular_db WHERE id = %s", params=(id,))

    def get_molecules(self):
        """Fetches all molecular database molecules as a DataFrame.

        Returns:
            pd.DataFrame
        """
        res = self._db.select_with_fields(self.MOLECULES_SEL_BY_DB, (self.id,))
        return pd.DataFrame(res)

    @property
    def formulas(self):
        """List[str]: List of molecular database formulas fetched from the database."""
        res = self._db.select(self.FORMULAS_SEL_BY_DB, (self.id,))
        return [row[0] for row in res]
