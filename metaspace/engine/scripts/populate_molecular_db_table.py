import argparse
import json

from sm.engine.config import SMConfig
from sm.engine.db import DB, ConnectionPool


def save_additional_info_to_db(db_id, user_id, input_path):
    conf = SMConfig.get_conf()
    with ConnectionPool(conf['db']):
        db = DB()
        if db.select_one('SELECT * FROM molecular_db WHERE id = %s', (db_id,)):
            print(f'Updating existing molecular database {db_id}')
            DB().alter(
                'UPDATE molecular_db SET user_id = %s, input_path = %s WHERE id = %s',
                (user_id, input_path, db_id),
            )
        else:
            print(f'Specified molecular database {db_id} does not exist.')


def main():
    parser = argparse.ArgumentParser(
        description='Populate user_id and input_path into a molecular_db table.'
    )
    parser.add_argument('filename', type=str, help='Input file with new user_id and input_path.')
    args = parser.parse_args()

    with open(args.filename, 'r') as f:
        databases = json.load(f)

    for database in databases:
        save_additional_info_to_db(database['id'], database['user_id'], database['input_path'])


if __name__ == "__main__":
    main()
