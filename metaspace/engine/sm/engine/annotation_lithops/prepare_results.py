from collections import defaultdict

import numpy as np
import pandas as pd
from lithops import FunctionExecutor
from lithops.storage import Storage
from pyimzml.ImzMLParser import PortableSpectrumReader

from sm.engine.annotation_lithops.annotate import make_sample_area_mask
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.annotation_lithops.utils import ds_dims
from sm.engine.png_generator import PngGenerator


def filter_results_and_make_pngs(
    fexec: FunctionExecutor,
    formula_metrics_df: pd.DataFrame,
    fdrs: pd.DataFrame,
    images_df: pd.DataFrame,
    imzml_reader: PortableSpectrumReader,
):
    results_df = formula_metrics_df.join(fdrs)
    results_df = results_df[~results_df.adduct.isna()]
    # TODO: Get real list of targeted DBs, only filter by FDR if not targeted
    results_df = results_df[results_df.fdr <= 0.5]
    results_df = results_df.sort_values('fdr')

    formula_is = set(results_df.index)
    image_tasks_df = images_df[images_df.index.isin(formula_is)].copy()
    w, h = ds_dims(imzml_reader.coordinates)
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
    print(job_bound_idxs, len(image_tasks_df))
    jobs = [
        [image_tasks_df.iloc[start:end]]
        for start, end in zip(job_bound_idxs[:-1], job_bound_idxs[1:])
        if start != end
    ]
    job_costs = [df.cost.sum() for df, in jobs]
    print(
        f'Generated {len(jobs)} PNG jobs, min cost: {np.min(job_costs)}, '
        f'max cost: {np.max(job_costs)}, total cost: {total_cost}'
    )
    png_generator = PngGenerator(make_sample_area_mask(imzml_reader.coordinates))

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

    futures = fexec.map(save_png_chunk, jobs, include_modules=['sm', 'sm.engine', 'png'])
    png_cobjs = fexec.get_result(futures)

    return results_df, png_cobjs
