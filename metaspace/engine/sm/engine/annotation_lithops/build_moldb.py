from __future__ import annotations

import logging
from concurrent.futures import ProcessPoolExecutor
from itertools import repeat
from typing import List, Tuple, TypedDict, Optional, cast

import numpy as np
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    CObj,
    save_cobjs,
    iter_cobjs_with_prefetch,
)
from sm.engine.ds_config import DSConfig
from sm.engine.annotation.fdr import FDR
from sm.engine.formula_parser import safe_generate_ion_formula
from sm.engine.utils.perf_profile import Profiler


class InputMolDb(TypedDict):
    id: int
    cobj: CloudObject
    targeted: Optional[bool]


class DbFDRData(InputMolDb):
    fdr: FDR
    formula_map_df: pd.DataFrame
    """columns: formula, modifier, target, formula_i"""


logger = logging.getLogger('annotation-pipeline')


def _get_db_fdr_and_formulas(ds_config: DSConfig, mols: List[str]):
    # TODO: Decompose the FDR class so that this isn't so awkward
    fdr = FDR(
        fdr_config=ds_config['fdr'],
        chem_mods=ds_config['isotope_generation']['chem_mods'],
        neutral_losses=ds_config['isotope_generation']['neutral_losses'],
        target_adducts=ds_config['isotope_generation']['adducts'],
        analysis_version=ds_config.get('analysis_version', 1),
    )
    fdr.decoy_adducts_selection(mols)
    target_mods = fdr.target_modifiers()
    formulas = [
        (formula, modifier, safe_generate_ion_formula(formula, modifier), modifier in target_mods)
        for formula, modifier in fdr.ion_tuples()
    ]
    formula_map_df = pd.DataFrame(
        formulas, columns=['formula', 'modifier', 'ion_formula', 'target']
    )
    formula_map_df = formula_map_df[~formula_map_df.ion_formula.isna()]

    return fdr, formula_map_df


def get_formulas_df(
    storage: Storage, ds_config: DSConfig, moldbs: List[InputMolDb]
) -> Tuple[List[CObj[DbFDRData]], pd.DataFrame]:
    # Load databases
    moldb_cobjects = [cast(CObj, moldb['cobj']) for moldb in moldbs]
    dbs_iter = iter_cobjs_with_prefetch(storage, moldb_cobjects)

    # Calculate formulas
    db_datas: List[DbFDRData] = []
    ion_formula = set()
    target_ion_formulas = set()
    targeted_ion_formulas = set()
    with ProcessPoolExecutor() as executor:
        for moldb, (fdr, formula_map_df) in zip(
            moldbs, executor.map(_get_db_fdr_and_formulas, repeat(ds_config), dbs_iter)
        ):
            db_datas.append(
                {
                    **moldb,  # type: ignore # https://github.com/python/mypy/issues/4122
                    'fdr': fdr,
                    'formula_map_df': formula_map_df,
                }
            )
            ion_formula.update(formula_map_df.ion_formula)
            target_ion_formulas.update(formula_map_df.ion_formula[formula_map_df.target])
            if moldb.get('targeted'):
                targeted_ion_formulas.update(formula_map_df.ion_formula)

    formulas_df = pd.DataFrame({'ion_formula': sorted(ion_formula)}).rename_axis(index='formula_i')
    formulas_df['target'] = formulas_df.ion_formula.isin(target_ion_formulas)
    formulas_df['targeted'] = formulas_df.ion_formula.isin(targeted_ion_formulas)
    # Replace ion_formula column with formula_i
    formula_to_id = pd.Series(formulas_df.index, formulas_df.ion_formula)
    for db_data in db_datas:
        db_data['formula_map_df']['formula_i'] = formula_to_id[
            db_data['formula_map_df'].ion_formula
        ].values
        del db_data['formula_map_df']['ion_formula']

    db_data_cobjs = save_cobjs(storage, db_datas)

    return db_data_cobjs, formulas_df


def store_formula_segments(storage: Storage, formulas_df: pd.DataFrame):
    n_formulas_segments = int(np.ceil(len(formulas_df) / 10000))
    segm_bounds = [
        len(formulas_df) * i // n_formulas_segments for i in range(n_formulas_segments + 1)
    ]
    segm_ranges = list(zip(segm_bounds[:-1], segm_bounds[1:]))
    segm_list = [formulas_df.iloc[start:end] for start, end in segm_ranges]

    formula_cobjs = save_cobjs(storage, segm_list)

    assert len(formula_cobjs) == len(
        set(co.key for co in formula_cobjs)
    ), 'Duplicate CloudObjects in formula_cobjs'

    return formula_cobjs


def build_moldb(
    executor: Executor,
    ds_config: DSConfig,
    moldbs: List[InputMolDb],
) -> Tuple[List[CObj[pd.DataFrame]], List[CObj[DbFDRData]]]:
    def _build_moldb(
        *, storage: Storage, perf: Profiler
    ) -> Tuple[List[CObj[pd.DataFrame]], List[CObj[DbFDRData]]]:
        logger.info('Generating formulas...')
        db_data_cobjs, formulas_df = get_formulas_df(storage, ds_config, moldbs)
        num_formulas = len(formulas_df)
        perf.record_entry('generated formulas', num_formulas=num_formulas)

        logger.info('Storing formulas...')
        formula_cobjs = store_formula_segments(storage, formulas_df)
        perf.record_entry('stored formulas', num_chunks=len(formula_cobjs))

        return formula_cobjs, db_data_cobjs

    return executor.call(_build_moldb, (), runtime_memory=4096)
