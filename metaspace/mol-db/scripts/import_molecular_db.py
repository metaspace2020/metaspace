import sys
from os.path import dirname
sys.path.append(dirname(dirname(__file__)))
import argparse
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from openbabel import OBMol, OBConversion
import numpy as np
import pandas as pd

from app.model.molecular_db import MolecularDB
from app.model.molecule import Molecule
from app.database import init_session, db_session
from app.log import LOG


def get_inchikey_gen():
    ob_conversion = OBConversion()
    ob_conversion.SetInAndOutFormats("inchi", "inchi")
    ob_conversion.SetOptions("K", ob_conversion.OUTOPTIONS)

    def get_inchikey(ser):
        try:
            if 'inchikey' in ser:
                return ser.inchikey

            if ser.inchi is None or ser.inchi == '':
                raise Exception('Empty inchi')

            mol = OBMol()
            ob_conversion.ReadString(mol, ser.inchi)
            return ob_conversion.WriteString(mol).strip('\n')
        except Exception as e:
            LOG.warning(e)
            return '{}-{}-{}'.format(ser.formula, ser['name'], ser['id'])

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


def remove_invalid_inchikey_molecules(mol_db_df):
    invalid_inchikey = mol_db_df.inchikey.isnull()
    n_invalid = invalid_inchikey.sum()
    if n_invalid > 0:
        LOG.warning("{} invalid records (InChI key couldn't be generated)".format(n_invalid))
    return mol_db_df[~invalid_inchikey]


def remove_duplicated_inchikey_molecules(mol_db_df):
    ids_to_insert = set()
    for inchikey, g in mol_db_df.groupby('inchikey'):
        if len(g) > 1:
            LOG.warning("{} molecules have the same InChI key {}: {} - taking only the first one" \
                        .format(len(g), inchikey, list(g['id'])))
        ids_to_insert.add(g.iloc[0].id)
    # remove duplicates
    return mol_db_df[mol_db_df['id'].isin(ids_to_insert)]


def save_molecules(mol_db, mol_db_df):
    new_molecule_df = mol_db_df[['inchikey', 'inchi', 'id', 'name', 'formula']].copy()
    new_molecule_df.columns = ['inchikey', 'inchi', 'mol_id', 'mol_name', 'sf']
    new_molecule_df['db_id'] = mol_db.id
    if new_molecule_df.shape[0] > 0:
        db_session.bulk_insert_mappings(Molecule, new_molecule_df.to_dict(orient='record'))


def filter_formulas(mol_db_df):

    def is_valid(sf):
        if '.' in sf:
            LOG.warning('"." in formula {}, skipping'.format(sf))
            return False
        try:
            parseSumFormula(sf)
        except Exception as e:
            LOG.warning(e)
            return False
        else:
            return True

    formulas = pd.Series(mol_db_df['formula'].unique())
    valid_formulas = formulas[formulas.map(is_valid)]
    return mol_db_df[mol_db_df.formula.isin(set(valid_formulas))].copy()


def import_molecules(mol_db, csv_file, delimiter):
    mol_db_df = pd.read_csv(open(csv_file, encoding='utf8'), sep=delimiter).fillna('')
    assert {'id', 'inchi', 'name', 'formula'}.issubset(set(mol_db_df.columns))

    mol_db_df = filter_formulas(mol_db_df)
    mol_db_df['inchikey'] = mol_db_df.apply(get_inchikey_gen(), axis=1)
    mol_db_df = remove_invalid_inchikey_molecules(mol_db_df)
    mol_db_df = remove_duplicated_inchikey_molecules(mol_db_df)

    LOG.info('{} new rows to insert into molecule table'.format(mol_db_df.shape[0]))
    if not mol_db_df.empty:
        save_molecules(mol_db, mol_db_df)
        db_session.commit()
    LOG.info('Inserted {} new molecules for {}'.format(len(mol_db_df), mol_db))


if __name__ == "__main__":
    help_msg = 'Import a new molecular database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('name', type=str, help='Database name')
    parser.add_argument('version', type=str, help='Database version')
    parser.add_argument('csv_file', type=str, help='Path to a database csv file')
    parser.add_argument('--sep', dest='sep', type=str, help='CSV file fields delimiter')
    parser.add_argument('--yes', dest='confirmed', type=bool, help='Don\'t ask for a confirmation')  # TODO: remove
    parser.add_argument('--drop', action='store_true',
                        help='Drop molecular database before importing? (destructive, use with caution!)')
    parser.set_defaults(sep='\t', confirmed=False)
    args = parser.parse_args()

    init_session()

    mol_db = MolecularDB.find_by_name_version(db_session, args.name, args.version)
    if mol_db and not args.drop:
        LOG.info('Molecular DB already exists: {} {}'.format(args.name, args.version))
    else:
        if mol_db:
            LOG.info('Deleting molecular DB: {} {}'.format(args.name, args.version))
            db_session.delete(mol_db)
            db_session.commit()

            mol_db = MolecularDB(id=mol_db.id, name=args.name, version=args.version)
        else:
            mol_db = MolecularDB(name=args.name, version=args.version)

        db_session.add(mol_db)
        db_session.commit()

        LOG.info('Appending molecules to Mol DB: {} {}'.format(args.name, args.version))
        import_molecules(mol_db, args.csv_file, args.sep)
        db_session.commit()
