from __future__ import annotations

import logging
import os
from concurrent.futures.thread import ThreadPoolExecutor
from typing import List, Dict

import pandas as pd
from lithops.storage import Storage

from sm.engine.annotation_lithops.build_moldb import DbFDRData
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import load_cobj, CObj

logger = logging.getLogger('annotation-pipeline')


def run_fdr(
    executor: Executor, formula_scores_df: pd.DataFrame, db_data_cobjects: List[CObj[DbFDRData]]
) -> Dict[int, pd.DataFrame]:
    msms_df = formula_scores_df[['msm']]

    def _run_fdr_for_db(db_data_cobject: CObj[DbFDRData], *, storage: Storage):
        db_data = load_cobj(storage, db_data_cobject)
        moldb_id = db_data['id']
        fdr = db_data['fdr']
        formula_map_df = db_data['formula_map_df']

        formula_msm = formula_map_df.merge(
            msms_df, how='inner', left_on='formula_i', right_index=True
        )
        modifiers = fdr.target_modifiers_df[['chem_mod', 'neutral_loss', 'adduct']]
        results_df = (
            fdr.estimate_fdr(formula_msm)
            .assign(moldb_id=moldb_id)
            .set_index('formula_i')
            .merge(modifiers, left_on='modifier', right_index=True)
            .drop(columns=['modifier'])
        )

        if not db_data['targeted']:
            results_df = results_df[results_df.fdr <= 1]

        return db_data['id'], results_df

    logger.info('Estimating FDRs...')
    results = executor.map(_run_fdr_for_db, db_data_cobjects, runtime_memory=1024)

    for moldb_id, moldb_fdrs in results:
        logger.info(f'DB {moldb_id} number of annotations with FDR less than:')
        for fdr_step in [0.05, 0.1, 0.2, 0.5]:
            logger.info(f'{fdr_step * 100:2.0f}%: {(moldb_fdrs.fdr < fdr_step).sum()}')

    return dict(results)
