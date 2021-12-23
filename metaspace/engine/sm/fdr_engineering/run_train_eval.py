"""
Step 3: Download the results, train and evaluate the model, and upload it to S3.

The S3 part requires you to have AWS configured in your engine/conf/config.json file.
It may also be necessary to call GlobalInit() before upload to ensure the config is loaded - haven't tested
"""

import json
import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
from botocore.exceptions import ClientError
from catboost import sum_models
from metaspace.sm_annotation_utils import SMInstance

from sm.engine.annotation.fdr import run_fdr_ranking, run_fdr_ranking_labeled
from sm.engine.storage import get_s3_client
from sm.fdr_engineering.train_model import (
    get_ranking_data,
    get_cv_splits,
    cv_train,
    get_many_fdr_diagnostics_remote,
    train_catboost_model,
)

logger = logging.getLogger(__name__)
dst_suffix = '_ml_training'

data_dir = Path('local/ml_scoring').resolve()  # the "local" subdirectory is .gitignored
data_dir.parent.mkdir(parents=True, exist_ok=True)
dataset_ids_file = data_dir / 'dataset_ids.txt'
dataset_ids = [ds_id.strip() for ds_id in dataset_ids_file.open().readlines()]
dst_dataset_ids = [ds_id + dst_suffix for ds_id in dataset_ids]

#%% Retrieve results from server and format them (skip this if you have downloaded results)
all_features = [
    'chaos',
    'spatial',
    'spectral',
    'mz_err_abs',
    'mz_err_rel',
    'chaos_fdr',
    'spatial_fdr',
    'spectral_fdr',
    'mz_err_abs_fdr',
    'mz_err_rel_fdr',
]
sm_dst = SMInstance(config_path=str(Path.home() / '.metaspace.local'))

# ds_diags is an iterable to save temp memory
ds_diags = get_many_fdr_diagnostics_remote(sm_dst, dst_dataset_ids)
metrics_df = get_ranking_data(ds_diags, all_features)
# metrics_df.to_parquet(data_dir / 'metrics_df.parquet')

#%% Open results from local files
metrics_df = pd.read_parquet(data_dir / 'metrics_df.parquet')


#%% Model parameters
features = [
    'chaos',
    'spatial',
    'spectral',
    'mz_err_abs',
    'mz_err_rel',
]
cb_params = {
    # 100 iterations  is enough for evaluation, but usually 600 gets the best score for the eval set
    'iterations': 10,
    # Ranking loss funcitons work best: https://catboost.ai/en/docs/concepts/loss-functions-ranking
    # Be careful about YetiRank - it doesn't support max_pairs and has a tendency to suddenly eat all your RAM
    # Pairwise functions are better but aren't compatible with monotone_constraints
    'loss_function': 'PairLogitPairwise:max_pairs=10000',
    'use_best_model': True,
    # Features are designed so that higher values are better, except FDR features where
    # lower values are better. Enforce this as a monotonicity constraint to reduce
    # overfitting & improve interpretability.
    # This seems to reduce accuracy, but I feel it's a necessary constraint unless
    # we can find an explanation for why a worse score could increase the likelihood
    # of an annotation.
    # 'monotone_constraints': {i: -1 if f.endswith('_fdr') else 1 for i, f in enumerate(features)},
    'verbose': True,
}

#%% Evaluate with cross-validation if desired
splits = get_cv_splits(metrics_df.ds_id.unique())
results = cv_train(metrics_df, splits, features, cb_params)
# Sum to make an ensemble model - sometimes it's useful
ens_model = sum_models(results.model.to_list())
#%% Make final model from all data
final_params = {
    **cb_params,
    'iterations': 600,
    'use_best_model': False,  # Must be disabled when eval set is None
    # CatBoost quantizes all inputs into bins, and border_count determines their granularity.
    # 254 is the default, higher gives slightly better accuracy but is slower
    'border_count': 1024,
}
final_model = train_catboost_model(
    metrics_df, metrics_df.ds_id.unique(), None, features, final_params
)

#%% Evaluate the model and print a summary
def eval_model(model, metrics_df):
    res = []
    # observed=True prevents empty grp_metrics_dfs when there's a group_name category but it has no rows
    for grp, grp_metrics_df in metrics_df.groupby('group_name', observed=True):
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
stats_df = pd.concat(
    [
        eval_model(model, metrics_df[metrics_df.ds_id.isin(eval_ds_ids)])
        for (_, eval_ds_ids), model in zip(splits, results.model)
    ]
)

# Ensemble model stats
# stats_df = eval_model(ens_model, metrics_df)

# Final model stats
# stats_df = eval_model(final_model, metrics_df)


print(stats_df.delta_fdr10.describe())

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


#%% Save model to S3 & DB
def upload_model(model, bucket, prefix, is_public, overwrite=False):
    s3_client = get_s3_client()

    if not overwrite:
        try:
            head = s3_client.head_object(Bucket=bucket, Key=f'{prefix}/model.cbm')
            head = s3_client.head_object(Bucket=bucket, Key=f'{prefix}/model.json')
        except:
            head = None
        assert head is None, 'Model already uploaded'

    # Create the bucket if necessary
    try:
        s3_client.head_bucket(Bucket=bucket)
    except ClientError:
        print(f"Couldn't find bucket {bucket}, creating...")
        s3_client.create_bucket(Bucket=bucket)

    with TemporaryDirectory() as tmpdir:
        cbm_path = Path(tmpdir) / 'model.cbm'
        json_path = Path(tmpdir) / 'model.json'
        model.save_model(str(cbm_path), format='cbm')
        model.save_model(str(json_path), format='json')
        acl = 'public-read' if is_public else None
        s3_client.put_object(
            Bucket=bucket, Key=f'{prefix}/model.cbm', Body=cbm_path.open('rb').read(), ACL=acl
        )

        s3_client.put_object(
            Bucket=bucket, Key=f'{prefix}/model.json', Body=json_path.open('rb').read(), ACL=acl
        )
    return f's3://{bucket}/{prefix}/model.cbm'


def upload_training_data(metrics_df, bucket, prefix, is_public, overwrite=False):
    s3_client = get_s3_client()

    if not overwrite:
        try:
            head = s3_client.head_object(Bucket=bucket, Key=f'{prefix}/train_data.parquet')
        except:
            head = None
        assert head is None, 'Training data already uploaded'

    with TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / 'train_data.parquet'
        metrics_df.to_parquet(path)
        acl = 'public-read' if is_public else None
        s3_client.put_object(
            Bucket=bucket, Key=f'{prefix}/train_data.parquet', Body=path.open('rb').read(), ACL=acl
        )
    return f's3://{bucket}/{prefix}/model.cbm'


model_name = 'v3_default'
s3_path = upload_model(final_model, 'sm-engine', f'scoring_models/{model_name}', is_public=True)
upload_training_data(metrics_df, 'sm-engine', f'scoring_models/{model_name}', is_public=True)
print(
    f'''Now add a row to the scoring_models table:
name: {model_name}
type: catboost
params: {json.dumps({"s3_path": s3_path, "features": features})}
'''
)
