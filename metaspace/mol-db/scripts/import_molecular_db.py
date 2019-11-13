import sys
from os.path import dirname

from app.moldb_import import import_molecular_database

sys.path.append(dirname(dirname(__file__)))
import argparse
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
import pandas as pd

from app.model.molecular_db import MolecularDB
from app.model.molecule import Molecule
from app.database import init_session, db_session
from app.log import logger


if __name__ == "__main__":
    help_msg = 'Import a new molecular database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Database name')
    parser.add_argument('version', type=str, help='Database version')
    optional_columns = ['inchikey']
    required_columns = ['mol_id', 'mol_name', 'sf']
    parser.add_argument(
        'csv_file',
        type=str,
        help=f'Path to a database csv file. Required columns: {required_columns}. '
        f'Optional: {optional_columns} ',
    )
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields delimiter')
    parser.add_argument(
        '--drop',
        action='store_true',
        help='Drop molecular database before importing? Use it with caution!',
    )
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    init_session()
    moldb_df = pd.read_csv(open(args.csv_file, encoding='utf8'), sep=args.sep).fillna('')
    import_molecular_database(args.name, args.version, moldb_df, drop_moldb=args.drop)
