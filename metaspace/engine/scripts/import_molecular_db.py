import argparse
import logging

from sm.engine import molecular_db
from sm.engine.util import GlobalInit

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
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    with GlobalInit(args.config_path):
        molecular_db.create(args.name, args.version, args.csv_file)


if __name__ == "__main__":
    main()
