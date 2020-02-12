import logging
from io import StringIO

import pandas as pd
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from sm.engine.db import DB
from sm.engine.errors import SMError

logger = logging.getLogger('engine')


def filter_formulas(mol_db_df):
    def is_valid(formula):
        try:
            if '.' in formula:
                logger.warning('"." in formula {}, skipping'.format(formula))
                return False
            parseSumFormula(formula)
        except Exception as e:
            logger.warning(e)
            return False
        else:
            return True

    formulas = pd.Series(mol_db_df['formula'].unique())
    valid_formulas = set(formulas[formulas.map(is_valid)])
    return mol_db_df[mol_db_df.formula.isin(valid_formulas)].copy()


def import_molecules_from_df(moldb, moldb_df):
    if moldb_df.empty:
        raise Exception(f'Empty dataframe: {moldb_df}')

    logger.info(f'{moldb}: trying to import {len(moldb_df)} molecules')
    required_columns = {'id', 'name', 'formula'}
    if not required_columns.issubset(set(moldb_df.columns)):
        raise Exception(
            f'Not all required columns provided: {moldb_df.columns} <= {required_columns}'
        )

    new_moldb_df = filter_formulas(moldb_df)[['id', 'name', 'formula']]
    new_moldb_df.rename({'id': 'mol_id', 'name': 'mol_name'}, axis='columns', inplace=True)
    new_moldb_df['moldb_id'] = int(moldb.id)

    columns = ['moldb_id', 'mol_id', 'mol_name', 'formula']
    buffer = StringIO()
    new_moldb_df[columns].to_csv(buffer, sep='\t', index=False, header=False)
    buffer.seek(0)
    DB().copy(buffer, sep='\t', table='molecule', columns=columns)
    logger.info(f'{moldb}: inserted {len(new_moldb_df)} molecules')


def create(name, version):
    # pylint: disable=unbalanced-tuple-unpacking
    (moldb_id,) = DB().insert_return(
        "INSERT INTO molecular_db (name, version, public) values (%s, %s, true) RETURNING id",
        rows=[(name, version)],
    )
    return MolecularDB(id=moldb_id)


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
