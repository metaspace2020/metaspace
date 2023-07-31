"""
Step 3: Download the results, train and evaluate the model, and upload it to S3.

The S3 part requires you to have AWS configured in your engine/conf/config.json file.
It may also be necessary to call GlobalInit() before upload to ensure the config is loaded
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import sum_models
from metaspace.sm_annotation_utils import SMInstance

from sm.engine.util import GlobalInit
from sm.engine.annotation.fdr import run_fdr_ranking, run_fdr_ranking_labeled
from sm.engine.annotation.scoring_model import (
    add_derived_features,
    upload_catboost_scoring_model,
    save_scoring_model_to_db,
)
from sm.fdr_engineering.train_model import (
    get_ranking_data,
    get_cv_splits,
    cv_train,
    get_many_fdr_diagnostics_remote,
    train_catboost_model,
)

logger = logging.getLogger(__name__)
DST_SUFFIX = '_ml_training'

data_dir = Path('local/ml_scoring').resolve()  # the "local" subdirectory is .gitignored
data_dir.parent.mkdir(parents=True, exist_ok=True)
dataset_ids_file = data_dir / 'dataset_ids.txt'
dataset_ids = [ds_id.strip() for ds_id in dataset_ids_file.open().readlines()]
dst_dataset_ids = [ds_id + DST_SUFFIX for ds_id in dataset_ids]

all_features = [
    'chaos',
    'spatial',
    'spectral',
    # _abserr suffix applies the 1-abs(val) transformation
    'mz_err_abs_abserr',
    'mz_err_rel_abserr',
    # _fdr suffix applies the FDR transformation
    'chaos_fdr',
    'spatial_fdr',
    'spectral_fdr',
    'mz_err_abs_fdr',
    'mz_err_rel_fdr',
]
#%% Download the data or load it from a local cache file
downloaded_data_file = data_dir / 'metrics_df_fdr20.parquet'
FORCE_REDOWNLOAD = False
if downloaded_data_file.exists() and not FORCE_REDOWNLOAD:
    metrics_df = pd.read_parquet(downloaded_data_file)
    logger.info(f'Loaded {downloaded_data_file}')
else:
    sm_dst = SMInstance(config_path=str(Path.home() / '.metaspace.local'))

    # ds_diags is an iterable to save temp memory
    ds_diags = get_many_fdr_diagnostics_remote(sm_dst, dst_dataset_ids)
    metrics_df = get_ranking_data(ds_diags, all_features)
    metrics_df.to_parquet(downloaded_data_file)

#%% Recalculate FDR fields
def calc_fdr_fields(df):
    target = df.target == 1.0
    target_df = df[target].copy()
    decoy_df = df[~target].copy()
    # FIXME: Remove hard-coded value 20 - should be decoy_sample_size
    decoy_sample_size = 20 / df[df.target == 1].modifier.nunique()
    add_derived_features(target_df, decoy_df, decoy_sample_size, all_features)

    fdr_cols = [c for c in target_df.columns if c.endswith('_fdr')]
    return pd.concat([target_df, decoy_df])[fdr_cols].add_suffix('g')


# NOTE: This groups by ds_id instead of group_name when running the FDR ranking. This means all
# adducts are combined into a single ranking
fdr_fields_df = pd.concat([calc_fdr_fields(df) for ds_id, df in metrics_df.groupby('ds_id')])
train_metrics_df = metrics_df = metrics_df.drop(
    columns=fdr_fields_df.columns, errors='ignore'
).join(fdr_fields_df)

#%% Make a smaller dataset for training, using this opportunity to balance targets & decoys
# (Skip this unless using very expensive loss functions like YetiRank)

# def subsample(df, max_group_size=5000):
#     target = df.target == 1.0
#     target_df = df[target].copy()
#     decoy_df = df[~target].copy()
#     return pd.concat(
#         [
#             target_df.sample(n=min(len(target_df), max(0, max_group_size - len(decoy_df)))),
#             decoy_df.sample(n=min(len(decoy_df), max(0, max_group_size - len(target_df)))),
#         ]
#     )
#
#
# train_metrics_df = pd.concat(
#     [subsample(df) for ds_id, df in metrics_df.groupby('group_name', observed=True)]
# )

#%% Model parameters
features = [
    'chaos',
    'spatial',
    'spectral',
    'mz_err_abs_abserr',
    'mz_err_rel_abserr',
]
cb_params = {
    # 100 iterations is usually consistent enough for comparing methods, but typically the best
    # for the eval set is around ~600
    'iterations': 1000,
    # Ranking loss functions work best: https://catboost.ai/en/docs/concepts/loss-functions-ranking
    # Be careful about YetiRank - it doesn't support max_pairs and has a tendency to suddenly eat
    # all your RAM
    # CatBoost docs say PairLogitPairwise is better than PairLogit, but I found it was slower and
    # gave worse results
    'loss_function': 'PairLogit:max_pairs=10000',
    'use_best_model': True,
    # Non-FDR features are designed so that higher values are better.
    # Enforce this as a monotonicity constraint to reduce overfitting & improve interpretability.
    # This seems to reduce accuracy, but I feel it's a necessary constraint unless
    # we can find an explanation for why a worse score could increase the likelihood
    # of an annotation.
    'monotone_constraints': {i: 0 if '_fdr' in f else 1 for i, f in enumerate(features)},
    'verbose': True,
    # 'task_type': 'GPU',
}

#%% Evaluate with cross-validation if desired
splits = get_cv_splits(metrics_df.ds_id.unique(), 5)
results = cv_train(train_metrics_df, splits, features, cb_params)
# Sum to make an ensemble model - sometimes it's interesting for debugging
ens_model = sum_models(results.model.to_list())
#%% Make final model from all data
final_params = {
    **cb_params,
    'iterations': 1000,
    'loss_function': 'PairLogit:max_pairs=10000',  # Reduce max_pairs if CatBoost complains
    'use_best_model': False,  # Must be disabled when eval set is None
    # CatBoost quantizes all inputs into bins, and border_count determines their granularity.
    # 254 is the default, higher gives slightly better accuracy but is slower to train
    'border_count': 1024,
}
final_model = train_catboost_model(
    metrics_df, metrics_df.ds_id.unique(), None, features, final_params
)

#%% Evaluate the model and print a summary
def eval_model(model, metrics_df):
    res = []
    # observed=True prevents empty grp_metrics_dfs when there's an empty group_name category
    for _, grp_metrics_df in metrics_df.groupby('group_name', observed=True):
        grp_msm = grp_metrics_df.chaos * grp_metrics_df.spatial * grp_metrics_df.spectral
        grp_preds = pd.Series(model.predict(grp_metrics_df[features]), index=grp_metrics_df.index)
        target = grp_metrics_df.target == 1.0
        msm_fdrs = run_fdr_ranking(grp_msm[target], grp_msm[~target], 20, True, True)
        preds_fdrs = run_fdr_ranking(grp_preds[target], grp_preds[~target], 20, True, True)
        res.append(
            {
                # 'group_name': grp,
                'ds_id': grp_metrics_df.ds_id.iloc[0],
                'msm_fdr10': np.count_nonzero(msm_fdrs <= 0.1),
                'preds_fdr10': np.count_nonzero(preds_fdrs <= 0.1),
                'msm_fdr20': np.count_nonzero(msm_fdrs <= 0.2),
                'preds_fdr20': np.count_nonzero(preds_fdrs <= 0.2),
            }
        )

    stats = pd.DataFrame(res).groupby('ds_id').sum().reset_index()
    stats['delta_fdr10'] = stats['preds_fdr10'] / stats['msm_fdr10']
    stats['delta_fdr20'] = stats['preds_fdr20'] / stats['msm_fdr20']

    return stats


# Cross-validated stats
# stats_df = pd.concat(
#     [
#         eval_model(model, metrics_df[metrics_df.ds_id.isin(eval_ds_ids)])
#         for (_, eval_ds_ids), model in zip(splits, results.model)
#     ]
# )

# Ensemble model stats
# stats_df = eval_model(ens_model, metrics_df)

# Final model stats (NOTE: This model is trained on the eval set, so this should not be used for
# reporting, only diagnostics)
stats_df = eval_model(final_model, metrics_df)


print(stats_df.delta_fdr10.describe())
n_fewer_anns = stats_df.delta_fdr10[stats_df.delta_fdr10 < 1].count()
print(
    f'Datasets with fewer annotations: {n_fewer_anns}/{len(stats_df)}'
    f'={n_fewer_anns / len(stats_df):.2%}'
)

#%% Export raw results for comparison with other implementations

export_df = metrics_df.drop(
    columns=[
        'total_iso_ints',
        'min_iso_ints',
        'max_iso_ints',
        'mz_mean',
        'mz_stddev',
        'theo_mz',
        'theo_ints',
        'formula_i',
    ],
    errors='ignore',
)
export_df['pred_score'] = final_model.predict(export_df[features])
export_df['pred_fdr'] = pd.concat(
    [
        run_fdr_ranking_labeled(grp.pred_score, grp.target == 1.0, 20, True, True)
        for _, grp in export_df.groupby('group_name')[['pred_score', 'target']]
    ]
)

export_df.to_csv('local/ml_scoring/prod_impl.csv', index=False)

#%% Save model to S3

MODEL_NAME = 'v3_default'
# Remove unwanted fields from metrics_df for saving training data
train_data = metrics_df[[*features, 'target', 'group_name', 'formula', 'modifier', 'decoy_i']]
params = upload_catboost_scoring_model(
    final_model,  # '../fdr-models/v2.20230517_(METASPACE-ML).cbm',
    'sm-engine',
    f'scoring_models/{MODEL_NAME}',
    is_public=True,
    train_data=train_data,
)
print(params)

# Update DB with model (if running a local METASPACE environment)
GlobalInit()
save_scoring_model_to_db(MODEL_NAME, 'catboost', params)
