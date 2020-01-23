import logging

import pandas as pd
from sm.engine.db import DB

logger = logging.getLogger('engine')


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
        self._db = DB()
        if id is not None:
            data = self._db.select_one_with_fields(self.MOLDB_SEL_BY_ID, params=(id,))
        elif name is not None:
            data = self._db.select_one_with_fields(self.MOLDB_SEL_BY_NAME, params=(name,))
        else:
            raise Exception('MolecularDB id or name should be provided')

        self.id, self.name, self.version = data['id'], data['name'], data['version']

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
