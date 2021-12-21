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

BUCKET_NAME = 'sm-engine-tests'


@pytest.fixture()
def s3_catboost_scoring_model(test_db):
    name = 'test_scoring_model'
    features = ['chaos', 'chaos_fdr', 'mz_err_abs_fdr']
    # Train a model that just predicts the chaos metric and ignores the other features
    dummy_X = np.array(
        list(product(np.linspace(0, 1, 101), np.linspace(0, 1, 2), np.linspace(0, 1, 2)))
    )
    model = CatBoost({'iterations': 10, 'verbose': False}).fit(Pool(dummy_X, dummy_X[:, 0]))

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
            'mz_err_abs': np.linspace(-1, 1, 11),
            'target': [True, True, False, False, False, True, False, False, True, True, True],
        }
    )
    target_df = metrics_df[metrics_df.target]
    decoy_df = metrics_df[~metrics_df.target]

    new_target_df, new_decoy_df = scoring_model.score(target_df, decoy_df, 2)

    print(new_target_df)
    print(new_decoy_df)

    assert False
