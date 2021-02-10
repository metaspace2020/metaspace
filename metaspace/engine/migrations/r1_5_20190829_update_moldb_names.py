import argparse
import logging

import pandas as pd

from sm.engine.db import DB, ConnectionPool
from sm.engine.config import init_loggers

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update molecular database molecule names')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('file_path', help='Path to file with new names')
    args = parser.parse_args()
    init_loggers()
    logger = logging.getLogger('engine')

    logger.info(f'Importing new names from {args.file_path}')

    db_config = {"host": "localhost", "database": "mol_db", "user": "mol_db"}
    with ConnectionPool(db_config):
        db = DB()
        names_df = pd.read_csv(args.file_path, sep='\t')[['id', 'name']]

        sql = (
            'WITH molecule_name AS (SELECT UNNEST(%s::text[]) as id_, UNNEST(%s::text[]) as name_) '
            'UPDATE molecule SET mol_name = molecule_name.name_ '
            'FROM molecule_name WHERE molecule.mol_id = molecule_name.id_'
        )
        db.alter(sql, [names_df.id.values.tolist(), names_df.name.values.tolist()])
