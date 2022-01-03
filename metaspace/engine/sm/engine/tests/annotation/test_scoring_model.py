import json
from itertools import product
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
import pytest
from catboost import CatBoost, Pool

from sm.engine.annotation.scoring_model import load_scoring_model
from sm.engine.db import DB
from sm.engine.storage import get_s3_client

from tests.conftest import (
    empty_test_db,
    test_db,
    sm_config,
)

BUCKET_NAME = 'sm-engine-tests'


@pytest.fixture()
def s3_catboost_scoring_model(test_db):
    name = 'test_scoring_model'
    features = ['chaos', 'chaos_fdr', 'mz_err_abs_fdr']
    # Train a model that just predicts the chaos metric and ignores the other features
    dummy_X = np.array(list(product(np.linspace(0, 1, 101), [0], [0])))
    model = CatBoost(
        {'iterations': 10, 'feature_weights': {0: 1, 1: 0, 2: 0}, 'verbose': False}
    ).fit(Pool(dummy_X, dummy_X[:, 0]))

    # Upload the model to S3
    s3_client = get_s3_client()
    try:
        s3_client.head_bucket(Bucket=BUCKET_NAME)
    except:
        print(f"Creating bucket {BUCKET_NAME}")
        s3_client.create_bucket(Bucket=BUCKET_NAME)

    with TemporaryDirectory() as tmpdir:
        cbm_path = Path(tmpdir) / 'model.cbm'
        model.save_model(str(cbm_path), format='cbm')
        s3_client.put_object(
            Bucket=BUCKET_NAME, Key=f'{name}/model.cbm', Body=cbm_path.open('rb').read()
        )
    params = {
        's3_path': f's3://{BUCKET_NAME}/{name}/model.cbm',
        'features': features,
    }
    DB().insert(
        'INSERT INTO scoring_model (name, type, params) VALUES (%s, %s, %s)',
        [(name, 'catboost', json.dumps(params))],
    )

    return name


def test_catboost_scoring_model(s3_catboost_scoring_model):
    scoring_model = load_scoring_model(s3_catboost_scoring_model)

    metrics_df = pd.DataFrame(
        {
            'chaos': np.linspace(1, 0, 11),
            'spatial': np.linspace(1, 0, 11),
            'spectral': np.linspace(1, 0, 11),
            'mz_err_abs': np.linspace(-1, 1, 11),
            'target': [True, False, False, True, False, True, False, False, True, False, True],
        }
    )
    target_df = metrics_df[metrics_df.target]
    decoy_df = metrics_df[~metrics_df.target]

    new_target_df, new_decoy_df = scoring_model.score(target_df, decoy_df, 2)
    new_merged_df = pd.concat([new_target_df, new_decoy_df]).sort_index()

    print(new_target_df)
    print(new_decoy_df)
    print(new_merged_df)
    assert 'chaos' in new_target_df.columns
    assert 'chaos_fdr' in new_target_df.columns
    assert 'mz_err_abs_fdr' in new_target_df.columns

    # Assert that the chaos_fdr column has been generated as expected
    # The following are in format #decoys/decoy_sample_size/#targets
    assert new_target_df.chaos_fdr.tolist() == [
        0 / 2 / 1,
        3 / 2 / 3,  # Inherits target[2]'s FDR due to monotonicity correction
        3 / 2 / 3,
        5 / 2 / 4,
        1.0,  # Hard-coded 1.0 because current models don't correctly handle MSM=0 annotations
    ]
    assert new_decoy_df.chaos_fdr.tolist() == [
        3 / 2 / 3,  # Inherits target[2]'s FDR due to monotonicity correction
        3 / 2 / 3,  # Inherits target[2]'s FDR due to monotonicity correction
        3 / 2 / 3,  # Inherits target[2]'s FDR due to monotonicity correction
        5 / 2 / 4,  # Inherits target[3]'s FDR due to monotonicity correction
        5 / 2 / 4,  # Inherits target[3]'s FDR due to monotonicity correction
        6 / 2 / 4,
    ]

    # Assert that the mz_err_abs_fdr column has been generated as expected
    # Values closer to the middle of the array should be closer to 0% FDR
    assert new_merged_df.mz_err_abs_fdr.iloc[:5].is_monotonic_decreasing
    assert new_merged_df.mz_err_abs_fdr.iloc[6:].is_monotonic_increasing
    assert new_merged_df.mz_err_abs_fdr.between(0.0, 1.0).all()

    sorted_by_chaos_fdr = pd.concat([new_target_df, new_decoy_df]).sort_values('chaos')
    # MSM isn't predictable because a new trained model is used every time the tests run, but it
    # should always at least monotonically map to the chaos metric it was trained on
    assert sorted_by_chaos_fdr.msm.is_monotonic_increasing
