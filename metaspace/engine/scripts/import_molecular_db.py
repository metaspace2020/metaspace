import argparse
import logging

import pandas as pd

from sm.engine.molecular_db import MolecularDB, import_molecules_from_df
from sm.engine.util import bootstrap_and_run

logger = logging.getLogger('engine')


def main():
    help_msg = 'Import a new molecular database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Database name')
    parser.add_argument('version', type=str, help='Database version')
    required_columns = ['id', 'name', 'formula']
    parser.add_argument(
        'csv_file',
        type=str,
        help=f'Path to a database csv file. Required columns: {required_columns}. ',
    )
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields delimiter')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    # pylint: disable=unused-argument
    def import_new_database(sm_config):
        moldb = MolecularDB.create(args.name, args.version)
        moldb_df = pd.read_csv(open(args.csv_file, encoding='utf8'), sep=args.sep).fillna('')
        import_molecules_from_df(moldb, moldb_df)

    bootstrap_and_run(args.config, import_new_database)


if __name__ == "__main__":
    main()
