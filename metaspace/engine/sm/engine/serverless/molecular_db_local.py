from functools import partial
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import pandas as pd
from time import time

from sm.engine.serverless.formula_parser import safe_generate_ion_formula
from sm.engine.serverless.metaspace_fdr import FDR
from sm.engine.serverless.utils import logger, serialise, deserialise, read_cloud_object_with_retry


DECOY_ADDUCTS = [
    '+He',
    '+Li',
    '+Be',
    '+B',
    '+C',
    '+N',
    '+O',
    '+F',
    '+Ne',
    '+Mg',
    '+Al',
    '+Si',
    '+P',
    '+S',
    '+Cl',
    '+Ar',
    '+Ca',
    '+Sc',
    '+Ti',
    '+V',
    '+Cr',
    '+Mn',
    '+Fe',
    '+Co',
    '+Ni',
    '+Cu',
    '+Zn',
    '+Ga',
    '+Ge',
    '+As',
    '+Se',
    '+Br',
    '+Kr',
    '+Rb',
    '+Sr',
    '+Y',
    '+Zr',
    '+Nb',
    '+Mo',
    '+Ru',
    '+Rh',
    '+Pd',
    '+Ag',
    '+Cd',
    '+In',
    '+Sn',
    '+Sb',
    '+Te',
    '+I',
    '+Xe',
    '+Cs',
    '+Ba',
    '+La',
    '+Ce',
    '+Pr',
    '+Nd',
    '+Sm',
    '+Eu',
    '+Gd',
    '+Tb',
    '+Dy',
    '+Ho',
    '+Ir',
    '+Th',
    '+Pt',
    '+Os',
    '+Yb',
    '+Lu',
    '+Bi',
    '+Pb',
    '+Re',
    '+Tl',
    '+Tm',
    '+U',
    '+W',
    '+Au',
    '+Er',
    '+Hf',
    '+Hg',
    '+Ta',
]
N_FORMULAS_SEGMENTS = 256
FORMULA_TO_ID_CHUNK_MB = 512


def build_database_local(storage, db_config, ds_config, mols_dbs_cobjects):
    t = time()

    logger.info('Generating formulas...')
    db_data_cobjects, formulas_df = get_formulas_df(
        storage, db_config, ds_config, mols_dbs_cobjects
    )
    num_formulas = len(formulas_df)
    logger.info(f'Generated {num_formulas} formulas')

    logger.info('Storing formulas...')
    formula_cobjects = store_formula_segments(storage, formulas_df)
    logger.info(f'Stored {num_formulas} formulas in {len(formula_cobjects)} chunks')

    exec_time = time() - t
    return formula_cobjects, db_data_cobjects, exec_time


def _get_db_fdr_and_formulas(ds_config, modifiers, adducts, mols):
    fdr_config = {'decoy_sample_size': ds_config['num_decoys']}
    nonempty_modifiers = [m for m in modifiers if m]
    fdr = FDR(fdr_config, [], nonempty_modifiers, adducts, 2)
    fdr.decoy_adducts_selection(mols)
    formulas = [
        (formula, modifier, safe_generate_ion_formula(formula, modifier))
        for formula, modifier in fdr.ion_tuples()
    ]
    formula_map_df = pd.DataFrame(formulas, columns=['formula', 'modifier', 'ion_formula'])

    # TODO: check why there are NaN values in 'formula_map_df.ion_formula' on an execution of ds2-db3
    formula_map_df = formula_map_df[~formula_map_df.ion_formula.isna()]

    return fdr, formula_map_df


def get_formulas_df(storage, db_config, ds_config, mols_dbs_cobjects):
    adducts = db_config['adducts']
    modifiers = db_config['modifiers']
    databases = db_config['databases']

    # Load databases
    def _get_mols(mols_cobj):
        return read_cloud_object_with_retry(storage, mols_cobj, deserialise)

    with ThreadPoolExecutor(max_workers=128) as pool:
        dbs = list(pool.map(_get_mols, mols_dbs_cobjects))

    # Calculate formulas
    db_datas = []
    ion_formula = set()
    with ProcessPoolExecutor() as ex:
        func = partial(_get_db_fdr_and_formulas, ds_config, modifiers, adducts)
        for db, (fdr, formula_map_df) in zip(databases, ex.map(func, dbs)):
            db_datas.append((db, fdr, formula_map_df))
            ion_formula.update(formula_map_df.ion_formula)

    if None in ion_formula:
        ion_formula.remove(None)

    formulas_df = pd.DataFrame({'ion_formula': sorted(ion_formula)}).rename_axis(index='formula_i')
    formula_to_id = pd.Series(formulas_df.index, formulas_df.ion_formula)
    for db, fdr, formula_map_df in db_datas:
        formula_map_df['formula_i'] = formula_to_id[formula_map_df.ion_formula].values
        del formula_map_df['ion_formula']

    def _store_db_data(db_data):
        return storage.put_cobject(serialise(db_data))

    with ThreadPoolExecutor() as pool:
        db_data_cobjects = list(pool.map(_store_db_data, db_datas))

    return db_data_cobjects, formulas_df


def store_formula_segments(storage, formulas_df):
    segm_bounds = [
        len(formulas_df) * i // N_FORMULAS_SEGMENTS for i in range(N_FORMULAS_SEGMENTS + 1)
    ]
    segm_ranges = list(zip(segm_bounds[:-1], segm_bounds[1:]))
    segm_list = [formulas_df.ion_formula.iloc[start:end] for start, end in segm_ranges]

    def _store(segm):
        return storage.put_cobject(serialise(segm))

    with ThreadPoolExecutor(max_workers=128) as pool:
        formula_cobjects = list(pool.map(_store, segm_list))

    assert len(formula_cobjects) == len(
        set(co.key for co in formula_cobjects)
    ), 'Duplicate CloudObjects in formula_cobjects'

    return formula_cobjects
