import argparse
import logging
from sm.engine import enrichment_db
from sm.engine import enrichment_term
from sm.engine import enrichment_db_molecule_mapping
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')


def main():
    help_msg = 'Import a new enrichment database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Enrichment database name')
    required_columns = ['id', 'name']
    parser.add_argument(
        'csv_file',
        type=str,
        help=f'Path to a enrichment database names csv file. Required columns: {required_columns}. ',
    )
    parser.add_argument('name_db', type=str, help='Database name')
    parser.add_argument(
        'json_file',
        type=str,
        help=f'Path to a enrichment database and molecular mapping.',
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.set_defaults(sep=',', confirmed=False)
    args = parser.parse_args()
    with GlobalInit(args.config_path):
        db_df = enrichment_db.create(args.name)
        enrichment_term.create(db_df.id, args.csv_file)
        enrichment_db_molecule_mapping.create(db_df.id, args.name_db, args.json_file)

if __name__ == "__main__":
    main()
