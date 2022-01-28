import logging
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from typing import List
from urllib.request import urlretrieve

import requests

import numpy as np
import pandas as pd
from catboost import CatBoost, Pool
from metaspace import SMInstance

from sm.engine.annotation.diagnostics import (
    DiagnosticType,
    DiagnosticImageFormat,
    DiagnosticImageKey,
)
from sm.engine.annotation.fdr import run_fdr_ranking_labeled
from sm.engine.annotation.scoring_model import add_derived_features

logger = logging.getLogger(__name__)


def get_fdr_diagnostics(sm: SMInstance, dataset_id: str):
    diagnostics = sm.dataset(id=dataset_id).diagnostics(False)
    for diag in diagnostics:
        if diag['type'] == DiagnosticType.FDR_RESULTS:
            db = diag['database']
            db_name = f'{db.name}-{db.version}'

            dfs = {
                img['key']: pd.read_parquet(BytesIO(requests.get(img['url']).content))
                for img in diag['images']
                if img['format'] == DiagnosticImageFormat.PARQUET
            }
            decoy_map_df = dfs[DiagnosticImageKey.DECOY_MAP_DF]
            formula_map_df = dfs[DiagnosticImageKey.FORMULA_MAP_DF]
            metrics_df = dfs[DiagnosticImageKey.METRICS_DF]
            yield db_name, decoy_map_df, formula_map_df, metrics_df


def get_many_fdr_diagnostics_remote(sm: SMInstance, dataset_ids: List[str]):
    """Retrieves FDR diagnostics dataframes from a remote server."""
    errors = []
    with ThreadPoolExecutor() as executor:

        def _get_ds(i, ds_id):
            print(f'Retrieving dataset {i}/{len(dataset_ids)}: {ds_id}')
            try:
                for diag in get_fdr_diagnostics(sm, ds_id):
                    yield ds_id, *diag
            except Exception as e:
                logger.exception(f'Error retrieving dataset {ds_id}: {e}')
                yield ds_id, e

        for diagset in executor.map(_get_ds, range(len(dataset_ids)), dataset_ids):
            for diagitem in diagset:
                if not isinstance(diagitem[1], Exception):
                    yield diagitem
                else:
                    errors.append(diagitem)
    print('Errors:', errors)


def download_fdr_diagnostics(sm: SMInstance, dataset_ids: List[str], output_dir: Path):
    for i, ds_id in enumerate(dataset_ids):
        print(f'Downloading diagnostics {i}/{len(dataset_ids)}: {ds_id}')
        try:
            diagnostics = sm.dataset(id=ds_id).diagnostics(False)
            for diag in diagnostics:
                if diag['type'] == DiagnosticType.FDR_RESULTS:
                    db = diag['database']
                    db_name = f'{db.name}-{db.version}'
                    db_dir = output_dir / db_name
                    db_dir.mkdir(exist_ok=True, parents=True)

                    for img in diag['images']:
                        if img['format'] == DiagnosticImageFormat.PARQUET:
                            img_path = db_dir / f"{ds_id}_{img['key']}.parquet"
                            urlretrieve(img['url'], img_path)

        except Exception as e:
            logger.exception(f'Error downloading diagnostic for dataset {ds_id}: {e}')


def load_fdr_diagnostics_from_files(path: Path):
    found_files = defaultdict(dict)
    for file in path.glob('*.parquet'):
        m = re.match(r'(.*)_(DECOY_MAP_DF|FORMULA_MAP_DF|METRICS_DF)\.parquet', file.name)
        if m:
            ds_id, key = m.groups()
            found_files[ds_id][key] = file

    for ds_id, files in found_files.items():
        decoy_map_df = pd.read_parquet(files['DECOY_MAP_DF'])
        formula_map_df = pd.read_parquet(files['FORMULA_MAP_DF'])
        metrics_df = pd.read_parquet(files['METRICS_DF'])
        yield ds_id, path.name, decoy_map_df, formula_map_df, metrics_df


def get_ranking_data(ds_diags, features=None, filter_bad_rankings=True):
    def _process_ds(args):
        i, (ds_id, db_name, decoy_map_df, formula_map_df, metrics_df) = args
        print(f'Processing dataset {i}: {ds_id}')
        _groups = []
        rankings = list(decoy_map_df.groupby('tm'))
        for target_modifier, map_df in rankings:
            targets = map_df[['formula', 'tm']].rename(columns={'tm': 'modifier'}).drop_duplicates()
            decoys = map_df[['formula', 'dm']].rename(columns={'dm': 'modifier'})
            decoy_sample_size = len(decoys) / len(targets)
            # v1 FDR takes the median of many separate rankings for the different decoy groups
            decoys['decoy_i'] = np.arange(len(decoys)) % decoy_sample_size
            target_df = targets.merge(formula_map_df, on=['formula', 'modifier']).merge(
                metrics_df, left_on='formula_i', right_index=True
            )
            decoy_df = decoys.merge(formula_map_df, on=['formula', 'modifier']).merge(
                metrics_df, left_on='formula_i', right_index=True
            )

            # Remove MSM==0 annotations as they're likely non-detections
            target_df = target_df[lambda df: (df.chaos > 0) & (df.spatial > 0) & (df.spectral > 0)]
            decoy_df = decoy_df[lambda df: (df.chaos > 0) & (df.spatial > 0) & (df.spectral > 0)]

            # Sanity check: Skip this group if there are <10 annotations that would get FDR<=20%
            # as it's an indicator that the data is bad for some reason (e.g. this adduct shouldn't
            # form at all with this instrument/sample type)

            if filter_bad_rankings and is_bad_ranking(target_df, decoy_df, decoy_sample_size):
                print(
                    f'Skipping {ds_id} {target_modifier} due to too few low-FDR targets or decoys'
                )
                continue

            # Add FDR metrics
            if features:
                add_derived_features(target_df, decoy_df, decoy_sample_size, features)
            group_name = f'{ds_id},{target_modifier}'
            merged_df = pd.concat(
                [
                    target_df.assign(target=1.0, group_name=group_name, ds_id=ds_id),
                    decoy_df.assign(target=0.0, group_name=group_name, ds_id=ds_id),
                ],
                ignore_index=True,
            )
            _groups.append(merged_df)
        return _groups

    with ThreadPoolExecutor() as executor:
        groups = []
        for result in executor.map(_process_ds, enumerate(ds_diags)):
            groups.extend(result)

    groups_df = pd.concat(groups, ignore_index=True)
    groups_df['ds_id'] = groups_df.ds_id.astype('category')
    groups_df['group_name'] = groups_df.group_name.astype('category')
    return groups_df


def is_bad_ranking(target_df, decoy_df, decoy_sample_size):
    all_df = pd.concat([target_df.assign(target=True), decoy_df.assign(target=False)])
    all_df['fdr'] = run_fdr_ranking_labeled(
        all_df.chaos * all_df.spatial * all_df.spectral,
        all_df.target,
        decoy_sample_size,
        rule_of_succession=True,
        monotonic=True,
    )
    if np.count_nonzero(all_df.fdr[all_df.target] <= 0.2) < 10:
        return True
    if np.count_nonzero(all_df.fdr[~all_df.target] <= 0.5) < 10:
        return True
    return False


def get_cv_splits(ds_ids, n_folds=5, n_shuffles=1):
    np.random.seed(123)
    splits = []
    for i in range(n_shuffles):
        ds_ids = np.sort(np.unique(ds_ids))
        np.random.shuffle(ds_ids)
        ds_bins = np.linspace(0, n_folds, len(ds_ids), endpoint=False).astype('i')
        splits.extend((ds_ids[ds_bins != i], ds_ids[ds_bins == i]) for i in range(n_folds))
    return splits


def make_pairs(df, n_per_group=10000, max_n=1000000):
    np.random.seed(42)
    group_names = df.group_name.unique()
    grps = df.groupby(['group_name', df.target == 1], observed=True).indices
    pair_sets = []
    for group_name in group_names:
        target_idxs = grps.get((group_name, True), [])
        decoy_idxs = grps.get((group_name, False), [])
        if len(decoy_idxs) > 0 and len(target_idxs) > 0:
            n_candidates = int(
                n_per_group * 2
            )  # Generate more than needed in case some aren't unique
            if len(decoy_idxs) * len(target_idxs) > n_candidates:
                # More combinations than requested pairs - select randomly
                pairs = np.hstack(
                    [
                        np.random.choice(target_idxs, n_candidates)[:, np.newaxis],
                        np.random.choice(decoy_idxs, n_candidates)[:, np.newaxis],
                    ]
                )
                pairs = np.unique(pairs, axis=0)
            else:
                # Fewer combinations than requested pairs - select all combinations
                pairs = np.hstack(
                    [
                        np.repeat(target_idxs, len(decoy_idxs))[:, np.newaxis],
                        np.tile(decoy_idxs, len(target_idxs))[:, np.newaxis],
                    ]
                )
            if len(pairs) > n_per_group:
                pairs = pairs[np.random.choice(len(pairs), n_per_group, replace=False), :]
            pair_sets.append(pairs)

    set_counts = np.array([len(p) for p in pair_sets])
    max_per_set = np.max(set_counts)
    # If there are too many pairs, reduce the maximum allowed size of each pair_set so that
    # smaller sets become more fairly represented in the re-balancing
    while np.sum(np.minimum(set_counts, max_per_set)) > max_n:
        surplus = np.sum(np.minimum(set_counts, max_per_set)) - max_n
        amount_to_subtract = max(1, surplus // len(set_counts))
        max_per_set -= amount_to_subtract

    # pylint: disable=consider-using-enumerate  # Would be misleading as pair_sets[i] is reassigned
    for i in range(len(pair_sets)):
        if len(pair_sets[i]) > max_per_set:
            pair_sets[i] = pair_sets[i][
                np.random.choice(len(pair_sets[i]), max_per_set, replace=False)
            ]

    pairs = np.vstack(pair_sets)
    return pairs


def cv_train(metrics_df, splits, features, cb_params):
    def run_split(i):
        train_ds_ids, eval_ds_ids = splits[i]
        model = train_catboost_model(metrics_df, train_ds_ids, eval_ds_ids, features, cb_params)
        best_score = model.get_best_score()
        return {
            'best_iteration': model.get_best_iteration(),
            'train': next(iter(best_score.get('learn', {}).values()), None) if best_score else None,
            'validate': next(iter(best_score.get('validation', {}).values()), None)
            if best_score
            else None,
            'model': model,
        }

    # CatBoost often only uses 2-3 cores, so run two at once to maximize throughput
    with ThreadPoolExecutor(2) as executor:
        results = list(executor.map(run_split, range(len(splits))))

    return pd.DataFrame(results)


def train_catboost_model(metrics_df, train_ds_ids, eval_ds_ids, features, cb_params):
    train_df = metrics_df[metrics_df.ds_id.isin(train_ds_ids)]
    train_pool = Pool(
        train_df[features],
        train_df['target'],
        group_id=train_df.group_name.cat.codes,
        # pairs=make_pairs(train_df), # CatBoost's pairs seem to be good enough
    )
    if eval_ds_ids is not None:
        eval_df = metrics_df[metrics_df.ds_id.isin(eval_ds_ids)]
        eval_pool = Pool(
            eval_df[features],
            eval_df['target'],
            group_id=eval_df.group_name.cat.codes,
            # pairs=make_pairs(eval_df),
        )
    else:
        eval_pool = None
    model = CatBoost(cb_params)
    model.fit(train_pool, eval_set=eval_pool)

    # Set model scale & bias to normalize predictions to the range [0, 1]
    model.set_scale_and_bias(1.0, 0.0)
    all_preds = np.concatenate(
        [model.predict(train_pool), model.predict(eval_pool) if eval_pool else []]
    )
    min_pred = np.min(all_preds)
    max_pred = np.max(all_preds)
    scale = 1 / (max_pred - min_pred)
    bias = -min_pred * scale
    model.set_scale_and_bias(scale, bias)
    # Ensure scaling worked
    # all_preds = np.concatenate([model.predict(eval_pool), model.predict(train_pool)])
    # assert np.isclose(np.min(all_preds), 0.0, atol=0.001)
    # assert np.isclose(np.max(all_preds), 1.0, atol=0.001)
    return model
