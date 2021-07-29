import logging
from collections import defaultdict
from typing import Dict, List

import numpy as np
import pandas as pd
from lithops.storage import Storage

from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation_lithops.build_moldb import InputMolDb
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.annotation.png_generator import PngGenerator

logger = logging.getLogger('annotation-pipeline')


def _split_png_jobs(image_tasks_df, w, h):
    # Guess the cost per imageset, and split into relatively even chunks.
    # This is a quick attempt and needs review
    # This assumes they're already sorted by cobj, and factors in:
    # * Number of populated pixels (because very sparse images should be much faster to encode)
    # * Total image size (because even empty pixels have some cost)
    # * Cost of loading a new cobj
    # * Constant overhead per image
    cobj_keys = [cobj.key for cobj in image_tasks_df.cobj]
    cobj_changed = np.array(
        [(i == 0 or key == cobj_keys[i - 1]) for i, key in enumerate(cobj_keys)]
    )
    image_tasks_df['cost'] = image_tasks_df.n_pixels + (w * h) / 5 + cobj_changed * 100000 + 1000
    total_cost = image_tasks_df.cost.sum()
    n_jobs = int(np.ceil(np.clip(total_cost / 1e8, 1, 100)))
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
        result_df = formula_metrics_df.join(fdr, how='inner').sort_values('fdr')
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
        logger.info(df)
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

    png_cobjs = fexec.map(save_png_chunk, jobs, include_modules=['png'])

    return results_dfs, png_cobjs
