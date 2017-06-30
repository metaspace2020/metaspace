import sys
from os.path import dirname
sys.path.append(dirname(dirname(__file__)))
from sqlalchemy import select
import argparse
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from openbabel import OBMol, OBConversion
import pandas as pd

from app.model.molecular_db import MolecularDB
from app.model.molecule import molecule_table, moldb_mol_table
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
    mol_db_df = pd.read_csv(open(csv_file, encoding='utf8'), sep=delimiter)
    assert {'id', 'inchi', 'name', 'formula'}.issubset(set(mol_db_df.columns))

    if 'inchikey' not in mol_db_df.columns:
        get_inchikey = get_inchikey_gen()
        mol_db_df['inchikey'] = mol_db_df.inchi.map(get_inchikey)

    mol_db_df = mol_db_df[mol_db_df.inchikey.isnull() == False]

    sel = select([molecule_table.c.inchikey])
    exist_inchikeys = set(map(lambda _: _[0], db_session.execute(sel).fetchall()))
    new_mol_df = mol_db_df[mol_db_df.inchikey.isin(exist_inchikeys) == False][['inchikey', 'inchi', 'formula']]
    new_mol_df.columns = ['inchikey', 'inchi', 'sf']
    if not new_mol_df.empty:
        db_session.execute(molecule_table.insert(),
                           list(new_mol_df.to_dict(orient='index').values()))

    new_db_mol_df = mol_db_df[['inchikey', 'id', 'name']]
    new_db_mol_df.insert(0, 'db_id', mol_db.id)
    new_db_mol_df.columns = ['db_id', 'inchikey', 'mol_id', 'mol_name']
    if not new_db_mol_df.empty:
        db_session.execute(moldb_mol_table.insert(),
                           list(new_db_mol_df.to_dict(orient='index').values()))

    db_session.commit()
    LOG.info('Inserted {} new molecules for {}'.format(len(mol_db_df), mol_db))


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
    else:
        LOG.info('Molecular DB already exists: {} {}'.format(args.name, args.version))
