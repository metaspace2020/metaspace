import argparse
from datetime import datetime as dt
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from csv import DictReader
from sqlalchemy.orm import sessionmaker
from openbabel import OBMol, OBConversion
import pandas as pd

from app.model.molecular_db import MolecularDB
from app.model.molecule import Molecule
from app.database import init_session, db_session
from app.log import LOG


def parsable(sf):
    try:
        parseSumFormula(sf)
        return True
    except Exception as e:
        LOG.warning(e)
        return False


def get_inchikey_gen():
    ob_conversion = OBConversion()
    ob_conversion.SetInAndOutFormats("inchi", "inchi")
    ob_conversion.SetOptions("K", ob_conversion.OUTOPTIONS)

    # inchiset = set()

    def get_inchikey(inchi):
        try:
            if inchi is None or inchi == '':
                raise Exception('Empty inchi')
            # if inchi in inchiset:
            #     raise Exception('Duplicated inchi={}'.format(inchi))
            # inchiset.add(inchi)

            mol = OBMol()
            ob_conversion.ReadString(mol, inchi)
            return ob_conversion.WriteString(mol).strip('\n')
        except Exception as e:
            LOG.warning(e)

    return get_inchikey


def get_or_create(session, model, query, **kwargs):
    inst = query.first()
    if inst:
        return inst
    else:
        inst = model(**kwargs)
        session.add(inst)
        # session.commit()
        return inst


def get_or_create_molecule(session, model, **kwargs):
    q = session.query(model).filter_by(inchikey=kwargs['inchikey'])
    return get_or_create(session, model, query=q, **kwargs)


def get_or_create_db_mol_assoc(session, model, **kwargs):
    q = session.query(model).filter_by(db_id=kwargs['db_id'], inchikey=kwargs['inchikey'])
    return get_or_create(session, model, query=q, **kwargs)


def append_molecules(mol_db, csv_file, delimiter):
    mol_db_df = pd.read_csv(open(csv_file), sep=delimiter)
    assert {'id', 'inchi', 'name', 'formula'}.issubset(set(mol_db_df.columns))

    mol_db_df = mol_db_df[mol_db_df.inchi.isnull() == False]
    get_inchikey = get_inchikey_gen()
    mol_db_df['inchikey'] = mol_db_df.inchi.map(get_inchikey)

    exist_inchikeys = set([row[0] for row in
                           db_session.query(Molecule.inchikey).filter(Molecule.db_id == mol_db.id).all()])
    new_inchikey_mask = mol_db_df.inchikey.isin(exist_inchikeys) == False
    new_molecules = mol_db_df[new_inchikey_mask].drop_duplicates(subset='inchikey').apply(
        lambda ser: Molecule(db_id=mol_db.id, inchikey=ser['inchikey'], inchi=ser['inchi'],
                             sf=ser['formula'], mol_id=ser['id'], mol_name=ser['mol_name']), axis=1).values.tolist()
    db_session.add_all(new_molecules)
    db_session.commit()

    LOG.info('Inserted {} new molecules for {}'.format(len(new_molecules), mol_db))


def insert_sum_formulas(db, db_name):
    agg_insert = ('insert into sum_formula ( '
                  'select row_number() OVER () as id, db_id, sf, array_agg(fid), array_agg(f.name) '
                  'from formula f '
                  'join formula_db db on db.id = f.db_id '
                  'where db.name = %s '
                  'group by db_id, sf)')
    db.alter(agg_insert, db_name)


if __name__ == "__main__":
    help_msg = 'Import a new molecular database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Database name')
    parser.add_argument('version', type=str, help='Database version')
    parser.add_argument('csv_file', type=str, help='Path to a database csv file')
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields delimiter')
    parser.add_argument('--yes', dest='confirmed', type=bool, help='Don\'t ask for a confirmation')
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    init_session()

    mol_db = MolecularDB.find_by_name_version(db_session, args.name, args.version)
    if not mol_db:
        mol_db = MolecularDB(name=args.name, version=args.version)
        db_session.add(mol_db)
        db_session.commit()

    append_molecules(mol_db, args.csv_file, args.sep)
    db_session.commit()
