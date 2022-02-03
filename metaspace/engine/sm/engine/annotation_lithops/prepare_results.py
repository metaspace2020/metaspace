import logging
from collections import defaultdict
from typing import Dict, List

import numpy as np
import pandas as pd
from lithops.storage import Storage

from sm.engine.annotation.diagnostics import FdrDiagnosticBundle
from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation.png_generator import PngGenerator
from sm.engine.annotation_lithops.build_moldb import InputMolDb, DbFDRData
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch, CObj

logger = logging.getLogger('annotation-pipeline')


def _split_png_jobs(image_tasks_df, w, h):
    # Guess the cost (in ms) per imageset, and split into relatively even chunks,
    # aiming for 2s each. Based on local testing, PngGenerator.generate_png() can encode
    # ~20M empty pixels per second, or ~10M non-empty pixels per second.
    # This assumes rows are already sorted by cobj, and factors in:
    # * Number of empty and non-empty pixels (1/20000 ms for empty, 1/10000 ms for non-empty)
    # * Cost of loading a new cobj (assumed to be 10ms)
    # * Constant overhead per image (assumed to be 1ms)
    cobj_keys = [cobj.key for cobj in image_tasks_df.cobj]
    cobj_changed = np.array(
        [(i == 0 or key == cobj_keys[i - 1]) for i, key in enumerate(cobj_keys)]
    )
    image_tasks_df['cost'] = (w * h + image_tasks_df.n_pixels) / 20000 + cobj_changed * 10 + 1
    total_cost = image_tasks_df.cost.sum()
    n_jobs = int(np.ceil(np.clip(total_cost / 2000, 1, 100)))
    job_bound_vals = np.linspace(0, total_cost + 1, n_jobs + 1)
    job_bound_idxs = np.searchsorted(np.cumsum(image_tasks_df.cost), job_bound_vals)
    jobs = [
        (image_tasks_df.iloc[start:end],)
        for start, end in zip(job_bound_idxs[:-1], job_bound_idxs[1:])
        if start != end
    ]
    if jobs:
        job_costs = [df.cost.sum() for df, in jobs]
        logger.debug(
            f'Generated {len(jobs)} PNG jobs, min cost: {np.min(job_costs)}, '
            f'max cost: {np.max(job_costs)}, total cost: {total_cost}'
        )
    else:
        logger.debug('No PNG jobs generated - probably no annotations')
    return jobs


def filter_results_and_make_pngs(
    fexec: Executor,
    formula_metrics_df: pd.DataFrame,
    moldbs: List[InputMolDb],
    fdrs: Dict[int, pd.DataFrame],
    images_df: pd.DataFrame,
    imzml_reader: LithopsImzMLReader,
):
    results_dfs = {}
    all_formula_is = set()
    for moldb_id, fdr in fdrs.items():
        result_df = (
            # Drop any columns already in fdr, as the FDR results may add or overwrite columns
            # with values from the scoring function.
            formula_metrics_df.drop(columns=fdr.columns, errors='ignore')
            .join(fdr, how='inner')
            .sort_values('fdr')
        )
        # Filter out zero-MSM annotations again to ensure that untargeted databases don't get
        # zero-MSM annotations, even if they have some overlap with targeted databases.
        is_targeted = any(db['targeted'] for db in moldbs if db['id'] == moldb_id)
        if not is_targeted:
            result_df = result_df[(result_df.msm > 0) & (result_df.fdr < 1)]
        results_dfs[moldb_id] = result_df
        all_formula_is.update(results_dfs[moldb_id].index)

    image_tasks_df = images_df[images_df.index.isin(all_formula_is)].copy()
    jobs = _split_png_jobs(image_tasks_df, imzml_reader.w, imzml_reader.h)
    png_generator = PngGenerator(imzml_reader.mask)

    def save_png_chunk(df: pd.DataFrame, *, storage: Storage):
        pngs = []
        groups = defaultdict(lambda: [])
        for formula_i, cobj in df.cobj.items():
            groups[cobj].append(formula_i)

        image_dict_iter = iter_cobjs_with_prefetch(storage, list(groups.keys()))
        for image_dict, formula_is in zip(image_dict_iter, groups.values()):
            for formula_i in formula_is:
                formula_pngs = [
                    png_generator.generate_png(img.toarray()) if img is not None else None
                    for img in image_dict[formula_i]
                ]
                pngs.append((formula_i, formula_pngs))
        return save_cobj(storage, pngs)

    png_cobjs = fexec.map(save_png_chunk, jobs, include_modules=['png'], runtime_memory=1024)

    return results_dfs, png_cobjs


def get_fdr_bundles(
    storage: Storage,
    formula_metrics_df: pd.DataFrame,
    db_data_cobjs: List[CObj[DbFDRData]],
    db_id_to_job_id: Dict[int, int],
) -> Dict[int, FdrDiagnosticBundle]:

    logger.debug(f'Making {len(db_data_cobjs)} FDR bundles')
    bundles: Dict[int, FdrDiagnosticBundle] = {}
    for db_data in iter_cobjs_with_prefetch(storage, db_data_cobjs):
        fdr = db_data['fdr']
        formula_map_df = (
            db_data['formula_map_df'].drop(columns=['target']).drop_duplicates(ignore_index=True)
        )

        # Extract the metrics for just this database, avoiding duplicates and handling missing rows
        metrics_df = formula_metrics_df.rename_axis(index='formula_i').merge(
            formula_map_df[['formula_i']].drop_duplicates().set_index('formula_i'),
            left_index=True,
            right_index=True,
        )
        job_id = db_id_to_job_id[db_data['id']]
        bundle = FdrDiagnosticBundle(
            decoy_sample_size=fdr.decoy_sample_size,
            decoy_map_df=fdr.td_df,
            formula_map_df=formula_map_df,
            metrics_df=metrics_df,
        )
        bundles[job_id] = bundle

    return bundles
