import os
import numpy as np
import pandas as pd
from time import time
from concurrent.futures.thread import ThreadPoolExecutor

from sm.engine.serverless.utils import (
    logger,
    deserialise,
    read_cloud_object_with_retry,
)


def _get_random_adduct_set(size, adducts, offset):
    r = np.random.RandomState(123)
    idxs = (r.random_integers(0, len(adducts), size) + offset) % len(adducts)
    return np.array(adducts)[idxs]


def calculate_fdrs_vm(storage, formula_scores_df, db_data_cobjects):
    t = time()

    msms_df = formula_scores_df[['msm']]

    def run_fdr(db_data_cobject):
        db, fdr, formula_map_df = read_cloud_object_with_retry(
            storage, db_data_cobject, deserialise
        )

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
        results_dfs = list(pool.map(run_fdr, db_data_cobjects))

    exec_time = time() - t
    return pd.concat(results_dfs), exec_time
