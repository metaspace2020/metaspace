import argparse
import logging
from psycopg2.errorcodes import UNIQUE_VIOLATION
from psycopg2 import errors
from sm.engine import enrichment_db
from sm.engine import molecular_db
from sm.engine import enrichment_term
from sm.engine import enrichment_db_molecule_mapping
from sm.engine.errors import SMError
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')

# pylint: disable=inconsistent-return-statements
def main():
    help_msg = 'Import a new enrichment database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Enrichment database name')
    required_columns = ['id', 'name']
    parser.add_argument(
        'csv_file',
        type=str,
        help=f'Path to a enrichment database names csv file. '
        f'Required columns: {required_columns}. ',
    )
    parser.add_argument('db_name', type=str, help='Database name')
    parser.add_argument('db_version', type=str, help='Database version')
    parser.add_argument(
        'json_file',
        type=str,
        help='Path to a enrichment database and molecular mapping.',
    )
    parser.add_argument(
        'filter_csv_file',
        type=str,
        help=f'Path to filtered enrichment terms. ' f'Required columns: {required_columns}. ',
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.set_defaults(sep=',', confirmed=False)
    args = parser.parse_args()
    with GlobalInit(args.config_path):
        # check if mol db exists
        try:
            molecular_db.find_by_name_version(args.db_name, args.db_version)
        except SMError:
            logger.info('Molecular database not found. Enrichment mapping failed...')
            return

        # check if enrichment db exists, if so it uses it, otherwise a new one is created
        try:
            db_df = enrichment_db.find_by_name(args.name)
        except SMError:
            db_df = enrichment_db.create(args.name)

        # populate enrichment terms
        try:
            enrichment_term.create(db_df.id, args.csv_file)
        except errors.lookup(UNIQUE_VIOLATION):
            logger.info('Enrichment terms were already loaded...')

        # create association between enrichment terms and molecular db
        try:
            enrichment_db_molecule_mapping.create(
                db_df.id, args.db_name, args.db_version, args.json_file, args.filter_csv_file
            )
        except errors.lookup(UNIQUE_VIOLATION):
            logger.info('Enrichment mapping were already loaded...')


if __name__ == "__main__":
    main()
