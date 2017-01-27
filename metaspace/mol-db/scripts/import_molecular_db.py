import argparse
from datetime import datetime as dt
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from csv import DictReader
from sqlalchemy.orm import sessionmaker

from app.model.molecular_db import MolecularDB
from app.model.molecule import Molecule
from app.database import init_session, db_session_factory
from app.log import LOG


def read_molecules(csv_file, delimiter):

    def parsable(sf):
        try:
            # parseSumFormula(sf)
            return True
        except Exception as e:
            LOG.warning(e)
            return False

    reader = DictReader(open(csv_file), delimiter=delimiter)

    molecules = []
    for d in reader:
        if parsable(d['formula']):
            molecules.append(Molecule(db_id=d['id'], name=d['name'], sf=d['formula']))

    return molecules


def insert_sum_formulas(db, db_name):
    agg_insert = ('insert into sum_formula ( '
                  'select row_number() OVER () as id, db_id, sf, array_agg(fid), array_agg(f.name) '
                  'from formula f '
                  'join formula_db db on db.id = f.db_id '
                  'where db.name = %s '
                  'group by db_id, sf)')
    db.alter(agg_insert, db_name)


if __name__ == "__main__":
    help_msg = ('Import a new molecular database')
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Database name')
    parser.add_argument('version', type=str, help='Database version')
    parser.add_argument('csv_file', type=str, help='Path to a database csv file')
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields delimiter')
    parser.add_argument('--yes', dest='confirmed', type=bool, help='Don\'t ask for a confirmation')
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    init_session()

    mol_db = MolecularDB(name=args.name, version=args.version)
    mol_db.molecules = read_molecules(args.csv_file, args.sep)

    db_session_factory.add(mol_db)
    db_session_factory.commit()
