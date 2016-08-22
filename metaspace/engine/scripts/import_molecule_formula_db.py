"""
Script for importing a new molecule database into the sm engine from a csv file
"""
import argparse
import json
from datetime import datetime as dt
from os import path
import pandas as pd
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

from sm.engine.db import DB
from sm.engine.util import proj_root, logger, init_logger


def del_prev_formula_db(db, db_name, confirmed=False):
    if db.select_one('SELECT * FROM formula_db WHERE name = %s', db_name):
        if not confirmed:
            delete = raw_input('Do you want to delete all the data associated with {} database? (y/n): '.format(db_name))
            confirmed = delete.lower() == 'y'
        if confirmed:
            db.alter('DELETE FROM formula_db WHERE name = %s', db_name)
        else:
            exit()


def insert_new_formula_db(db, db_name):
    insert = 'INSERT INTO formula_db (version, name) VALUES (%s, %s)'
    db.insert(insert, [(dt.now().strftime('%Y-%m-%d'), args.db_name)])


def insert_new_formulas(db, db_name, csv_file, sep):

    def parsable(sf):
        try:
            parseSumFormula(sf)
            return True
        except Exception as e:
            logger.warning(e)
            return False

    sf_df = pd.read_csv(csv_file, names=['fid', 'name', 'sf'], sep=sep)
    sf_df = sf_df[sf_df.sf.map(parsable)]
    db_id = db.select_one('SELECT id FROM formula_db WHERE name = %s', db_name)[0]
    sf_df.insert(0, 'db_id', db_id)
    db.insert("INSERT INTO formula (db_id, fid, name, sf) VALUES (%s, %s, %s, %s)", [tuple(r) for r in sf_df.values])


def insert_sum_formulas(db, db_name):
    agg_insert = ('insert into sum_formula ( '
                  'select row_number() OVER () as id, db_id, sf, array_agg(fid), array_agg(f.name) '
                  'from formula f '
                  'join formula_db db on db.id = f.db_id '
                  'where db.name = %s '
                  'group by db_id, sf)')
    db.alter(agg_insert, db_name)


if __name__ == "__main__":
    help_msg = ('Import a new molecule formula database into the engine'
                'CSV file should contain only three columns without headers: formula id, formula name, sum formula')
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('db_name', type=str, help='Database name')
    parser.add_argument('csv_file', type=str, help='Path to a database csv file')
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields separator')
    parser.add_argument('--yes', dest='confirmed', type=bool, help='Don\'t ask for a confirmation')
    parser.add_argument('--config', type=str, help='SM config path')
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    init_logger()

    if args.config:
        sm_config = json.load(open(args.config))
    else:
        sm_config = json.load(open(path.join(proj_root(), 'conf/config.json')))

    db = DB(sm_config['db'], autocommit=True)

    del_prev_formula_db(db, args.db_name, args.confirmed)
    insert_new_formula_db(db, args.db_name)
    insert_new_formulas(db, args.db_name, args.csv_file, args.sep.decode('string-escape'))
    insert_sum_formulas(db, args.db_name)
