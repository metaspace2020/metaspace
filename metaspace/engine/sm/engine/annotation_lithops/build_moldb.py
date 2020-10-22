from __future__ import annotations

import logging
from concurrent.futures import ProcessPoolExecutor
from itertools import repeat
from typing import List, Tuple

import numpy as np
import pandas as pd
from lithops.storage import Storage

from sm.engine.annotation_lithops.io import CObj, save_cobjs, load_cobjs
from sm.engine.ds_config import DSConfig
from sm.engine.fdr import FDR
from sm.engine.formula_parser import safe_generate_ion_formula

DbDataTuple = Tuple[int, FDR, pd.DataFrame]

logger = logging.getLogger('annotation-pipeline')


def _get_db_fdr_and_formulas(ds_config: DSConfig, mols: List[str]):
    fdr = FDR(
        fdr_config=ds_config['fdr'],
        chem_mods=ds_config['isotope_generation']['chem_mods'],
        neutral_losses=ds_config['isotope_generation']['neutral_losses'],
        target_adducts=ds_config['isotope_generation']['adducts'],
        analysis_version=ds_config.get('analysis_version', 1),
    )
    fdr.decoy_adducts_selection(mols)
    formulas = [
        (formula, modifier, safe_generate_ion_formula(formula, modifier))
        for formula, modifier in fdr.ion_tuples()
    ]
    formula_map_df = pd.DataFrame(formulas, columns=['formula', 'modifier', 'ion_formula'])

    # TODO: check why there are NaN values in 'formula_map_df.ion_formula' on an execution of ds2-db3
    formula_map_df = formula_map_df[~formula_map_df.ion_formula.isna()]

    return fdr, formula_map_df


def get_formulas_df(
    storage: Storage, ds_config: DSConfig, mols_dbs_cobjects: List[CObj[List[str]]]
) -> Tuple[List[CObj[DbDataTuple]], pd.DataFrame]:
    databases = ds_config['database_ids']

    # Load databases
    dbs = load_cobjs(storage, mols_dbs_cobjects)

    # Calculate formulas
    db_datas: List[DbDataTuple] = []
    ion_formula = set()
    with ProcessPoolExecutor() as ex:
        for db, (fdr, formula_map_df) in zip(
            databases, ex.map(_get_db_fdr_and_formulas, repeat(ds_config), dbs)
        ):
            db_datas.append((db, fdr, formula_map_df))
            ion_formula.update(formula_map_df.ion_formula)

    if None in ion_formula:
        ion_formula.remove(None)

    formulas_df = pd.DataFrame({'ion_formula': sorted(ion_formula)}).rename_axis(index='formula_i')
    formula_to_id = pd.Series(formulas_df.index, formulas_df.ion_formula)
    for db, fdr, formula_map_df in db_datas:
        formula_map_df['formula_i'] = formula_to_id[formula_map_df.ion_formula].values
        del formula_map_df['ion_formula']

    db_data_cobjects = save_cobjs(storage, db_datas)

    return db_data_cobjects, formulas_df


def store_formula_segments(storage: Storage, formulas_df: pd.DataFrame):
    n_formulas_segments = int(np.ceil(len(formulas_df) / 10000))
    segm_bounds = [
        len(formulas_df) * i // n_formulas_segments for i in range(n_formulas_segments + 1)
    ]
    segm_ranges = list(zip(segm_bounds[:-1], segm_bounds[1:]))
    segm_list = [formulas_df.ion_formula.iloc[start:end] for start, end in segm_ranges]

    formula_cobjects = save_cobjs(storage, segm_list)

    assert len(formula_cobjects) == len(
        set(co.key for co in formula_cobjects)
    ), 'Duplicate CloudObjects in formula_cobjects'

    return formula_cobjects


def build_moldb(
    ds_config: DSConfig, mols_dbs_cobjects: List[CObj[List[str]]], *, storage: Storage
) -> Tuple[List[CObj[pd.DataFrame]], List[CObj[DbDataTuple]]]:
    logger.info('Generating formulas...')
    db_data_cobjects, formulas_df = get_formulas_df(storage, ds_config, mols_dbs_cobjects)
    num_formulas = len(formulas_df)
    logger.info(f'Generated {num_formulas} formulas')

    logger.info('Storing formulas...')
    formula_cobjects = store_formula_segments(storage, formulas_df)
    logger.info(f'Stored {num_formulas} formulas in {len(formula_cobjects)} chunks')

    return formula_cobjects, db_data_cobjects


def validate_formula_cobjects(storage: Storage, formula_cobjects: List[CObj[pd.DataFrame]]):
    segms = load_cobjs(storage, formula_cobjects)

    formula_sets = []
    index_sets = []
    # Check format
    for segm_i, segm in enumerate(segms):
        if not isinstance(segm, pd.Series):
            print(f'formula_cobjects[{segm_i}] is not a pd.Series')
        else:
            if segm.empty:
                print(f'formula_cobjects[{segm_i}] is empty')
            if segm.name != "ion_formula":
                print(f'formula_cobjects[{segm_i}].name != "ion_formula"')
            if not isinstance(segm.index, pd.RangeIndex):
                print(f'formula_cobjects[{segm_i}] is not a pd.RangeIndex')
            if segm.index.name != "formula_i":
                print(f'formula_cobjects[{segm_i}].index.name != "formula_i"')
            if (segm == '').any():
                print(f'formula_cobjects[{segm_i}] contains an empty string')
            if any(not isinstance(s, str) for s in segm):
                print(f'formula_cobjects[{segm_i}] contains non-string values')
            duplicates = segm[segm.duplicated()]
            if not duplicates.empty:
                print(f'formula_cobjects[{segm_i}] contains {len(duplicates)} duplicate values')

            formula_sets.append(set(segm))
            index_sets.append(set(segm.index))

    if sum(len(fs) for fs in formula_sets) != len(set().union(*formula_sets)):
        print(f'formula_cobjects contains values that are included in multiple segments')
    if sum(len(idxs) for idxs in index_sets) != len(set().union(*index_sets)):
        print(f'formula_cobjects contains formula_i values that are included in multiple segments')

    n_formulas = sum(len(fs) for fs in formula_sets)
    print(f'Found {n_formulas} formulas across {len(segms)} segms')

    # __import__('__main__').db_segms = db_segms
