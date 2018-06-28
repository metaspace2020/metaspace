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


def append_molecules(mol_db, csv_file, delimiter):
    mol_db_df = pd.read_csv(open(csv_file, encoding='utf8'), sep=delimiter).fillna('')
    assert {'id', 'inchi', 'name', 'formula'}.issubset(set(mol_db_df.columns))

    get_inchikey = get_inchikey_gen()
    if 'inchikey' not in mol_db_df.columns:
        mol_db_df['inchikey'] = mol_db_df.inchi.map(get_inchikey)
    else:
        mol_db_df['inchikey'] = mol_db_df.apply(
            lambda s: get_inchikey(s.inchi) if s.inchikey == '' else s.inchikey, axis=1)

    mol_db_df = remove_invalid_inchikey_molecules(mol_db_df)

    mol_db_df = remove_duplicated_inchikey_molecules(mol_db_df)

    LOG.info('{} new rows to insert into molecule table'.format(mol_db_df.shape[0]))
    if not mol_db_df.empty:
        sel = select([molecule_table.c.inchikey])
        existing_inchikeys = {x[0] for x in db_session.execute(sel).fetchall()}
        # add molecules with new inchikeys
        new_molecule_df = mol_db_df[['inchikey', 'inchi', 'formula']]
        new_molecule_df = new_molecule_df[~new_molecule_df['inchikey'].isin(existing_inchikeys)]
        new_molecule_df.columns = ['inchikey', 'inchi', 'sf']
        if new_molecule_df.shape[0] > 0:
            db_session.execute(molecule_table.insert(),
                               list(new_molecule_df.to_dict(orient='index').values()))

        new_moldb_molecule_df = mol_db_df[['inchikey', 'id', 'name']]
        new_moldb_molecule_df.insert(0, 'db_id', mol_db.id)
        new_moldb_molecule_df.columns = ['db_id', 'inchikey', 'mol_id', 'mol_name']
        LOG.info('{} new rows to insert into molecular_db_molecule table'.format(new_moldb_molecule_df.shape[0]))
        if not new_moldb_molecule_df.empty:
            # here we must add records for both new and already present inchikeys
            db_session.execute(moldb_mol_table.insert(),
                               list(new_moldb_molecule_df.to_dict(orient='index').values()))
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
        append_molecules(mol_db, args.csv_file, args.sep)
        db_session.commit()
