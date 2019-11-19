import logging

import pandas as pd
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

from app.database import db_session as db
from app.errors import BadRequestError, ObjectNotExistError
from app.model import Molecule, MolecularDB

logger = logging.getLogger('API')


def get_inchikey_gen(mol_db_id):
    def get_inchikey(ser):
        try:
            if ser.get('inchikey', None):
                return ser.inchikey

            return f"{mol_db_id}:{ser['id']}"
        except Exception as e:
            logger.warning(f'{e}\t{ser}')
            return '{}-{}-{}'.format(ser.formula, ser['name'], ser['id'])

    return get_inchikey


def filter_formulas(mol_db_df):
    def is_valid(sf):
        try:
            if '.' in sf:
                logger.warning('"." in formula {}, skipping'.format(sf))
                return False
            parseSumFormula(sf)
        except Exception as e:
            logger.warning(e)
            return False
        else:
            return True

    formulas = pd.Series(mol_db_df['formula'].unique())
    valid_formulas = formulas[formulas.map(is_valid)]
    return mol_db_df[mol_db_df.formula.isin(set(valid_formulas))].copy()


def remove_invalid_inchikey_molecules(mol_db_df):
    invalid_inchikey = mol_db_df.inchikey.isnull()
    n_invalid = invalid_inchikey.sum()
    if n_invalid > 0:
        logger.warning("{} invalid records (InChI key couldn't be generated)".format(n_invalid))
    return mol_db_df[~invalid_inchikey]


def remove_duplicated_inchikey_molecules(mol_db_df):
    ids_to_insert = set()
    for inchikey, g in mol_db_df.groupby('inchikey'):
        if len(g) > 1:
            logger.warning(
                "{} molecules have the same InChI key {}: {} - taking only the first one".format(
                    len(g), inchikey, list(g['id'])
                )
            )
        ids_to_insert.add(g.iloc[0].id)
    # remove duplicates
    return mol_db_df[mol_db_df['id'].isin(ids_to_insert)]


def save_molecules(mol_db, moldb_df):
    logger.info('{} new rows to insert into molecule table'.format(moldb_df.shape[0]))
    new_molecule_df = moldb_df[['inchikey', 'id', 'name', 'formula']].copy()
    new_molecule_df.rename(
        {'id': 'mol_id', 'name': 'mol_name', 'formula': 'sf'}, axis='columns', inplace=True
    )
    new_molecule_df['inchi'] = ''
    new_molecule_df['db_id'] = int(mol_db.id)

    db.bulk_insert_mappings(Molecule, new_molecule_df.to_dict(orient='record'))
    logger.info('Inserted {} new molecules for {}'.format(len(moldb_df), mol_db))


def import_molecules_from_df(moldb, moldb_df):
    logger.info(f'Importing molecules to Mol DB: {moldb}')
    required_columns = {'id', 'name', 'formula'}
    if not required_columns.issubset(set(moldb_df.columns)):
        raise BadRequestError(
            f'Not all required columns provided: {moldb_df.columns} <= {required_columns}'
        )

    moldb_df = filter_formulas(moldb_df)
    moldb_df['inchikey'] = moldb_df.apply(get_inchikey_gen(moldb.id), axis=1)
    moldb_df = remove_invalid_inchikey_molecules(moldb_df)
    moldb_df = remove_duplicated_inchikey_molecules(moldb_df)

    if not moldb_df.empty:
        save_molecules(moldb, moldb_df)
    else:
        raise BadRequestError(f'Empty dataframe: {moldb_df}')
