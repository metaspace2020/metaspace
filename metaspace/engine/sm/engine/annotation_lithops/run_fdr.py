from lithops.storage import Storage
from typing import List, Tuple

import os
import numpy as np
import pandas as pd
from time import time
from concurrent.futures.thread import ThreadPoolExecutor

from sm.engine.annotation_lithops.build_moldb import DbDataTuple
from sm.engine.annotation_lithops.utils import logger
from sm.engine.annotation_lithops.io import load_cobj, CObj


def _get_random_adduct_set(size, adducts, offset):
    r = np.random.RandomState(123)
    idxs = (r.random_integers(0, len(adducts), size) + offset) % len(adducts)
    return np.array(adducts)[idxs]


def run_fdr(
    storage: Storage, formula_scores_df: pd.DataFrame, db_data_cobjects: List[CObj[DbDataTuple]]
) -> Tuple[pd.DataFrame, float]:
    t = time()

    msms_df = formula_scores_df[['msm']]

    def _run_fdr_for_db(db_data_cobject: CObj[DbDataTuple]):
        db, fdr, formula_map_df = load_cobj(storage, db_data_cobject)

        formula_msm = formula_map_df.merge(
            msms_df, how='inner', left_on='formula_i', right_index=True
        )
        modifiers = fdr.target_modifiers_df[['neutral_loss', 'adduct']].rename(
            columns={'neutral_loss': 'modifier'}
        )
        results_df = (
            fdr.estimate_fdr(formula_msm)
            .assign(database_path=db)
            .set_index('formula_i')
            .rename(columns={'modifier': 'combined_modifier', 'formula': 'mol'})
            .merge(modifiers, left_on='combined_modifier', right_index=True)
            .drop(columns=['combined_modifier'])
        )
        return results_df

    logger.info('Estimating FDRs...')
    with ThreadPoolExecutor(os.cpu_count()) as pool:
        results_dfs = list(pool.map(_run_fdr_for_db, db_data_cobjects))

    exec_time = time() - t
    return pd.concat(results_dfs), exec_time
