import json
import re
import logging
from datetime import datetime
from hashlib import sha1
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import List, Tuple, Dict, Optional, Union

import numpy as np
import pandas as pd
from catboost import CatBoost

from sm.engine.storage import get_s3_client
from sm.engine.util import split_s3_path

logger = logging.getLogger('engine')


def add_derived_features(
    target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float, features: List[str]
):
    """Adds extra feature columns needed for the model to target_df and decoy_df.
    This is separate from the metric calculation in formula_validator as these derived features
    require statistics from a full ranking of targets & decoys, which isn't available in
    formula_validator .
    """
    # pylint: disable=import-outside-toplevel,cyclic-import  # circular import
    from sm.engine.annotation.fdr import score_to_fdr_map

    nonzero_targets = (target_df.chaos > 0) & (target_df.spatial > 0) & (target_df.spectral > 0)
    nonzero_decoys = (decoy_df.chaos > 0) & (decoy_df.spatial > 0) & (decoy_df.spectral > 0)

    fdr_features = [(f[: -len('_fdr')], f) for f in features if f.endswith('_fdr')]
    for feature, fdr_feature in fdr_features:
        target_values = target_df[feature].values
        decoy_values = decoy_df[feature].values
        if feature.startswith('mz_err'):
            # With mz_err features, 0 is the best value, and values get worse as they move away
            # from 0. They're transformed by the negative absolute value here so that
            # higher values are better. However, this transformed value is not interesting
            # to either users or debugging developers, so the temporary value is not stored
            # as a new feature.
            target_values = -np.abs(target_values)
            decoy_values = -np.abs(decoy_values)

        # Rule of Succession is disabled here because it would add an unnecessary bias at
        # by limiting the minimum value. It will eventually be applied in the final FDR ranking.
        fdr_map = score_to_fdr_map(
            target_values[nonzero_targets],
            decoy_values[nonzero_decoys],
            decoy_ratio,
            rule_of_succession=False,
            monotonic=True,
        )

        # fdr_map = fdr_map.clip(0.0, 1.0)
        target_df[fdr_feature] = np.where(
            nonzero_targets, fdr_map.reindex(target_values, fill_value=1.0).values, 1.0
        )
        decoy_df[fdr_feature] = np.where(
            nonzero_decoys, fdr_map.reindex(decoy_values, fill_value=1.0).values, 1.0
        )

    abserr_features = [(f[: -len('_abserr')], f) for f in features if f.endswith('_abserr')]
    for feature, abserr_feature in abserr_features:
        # With mz_err features, 0 is the best value, and values get worse as they move away
        # from 0 in either direction. They're transformed by the negative absolute value here
        # so that higher values are better. However, this transformed value is not interesting
        # to either users or debugging developers, so it's filtered out later.
        target_df[abserr_feature] = -target_df[feature].abs()
        decoy_df[abserr_feature] = -decoy_df[feature].abs()


def remove_uninteresting_features(target_df: pd.DataFrame, decoy_df: pd.DataFrame):
    uninteresting_features = [f for f in target_df.columns if f.endswith('_abserr')]
    target_df = target_df.drop(uninteresting_features, axis=1)
    decoy_df = decoy_df.drop(uninteresting_features, axis=1)
    return target_df, decoy_df


class ScoringModel:
    def score(
        self, target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Processes the targets & decoys from one FDR ranking and returns the dataframes with the
        'msm' column populated with the computed score, and potentially other columns added if they
        would help explain the score."""
        raise NotImplementedError()


class CatBoostScoringModel(ScoringModel):
    def __init__(self, model_name: str, model: CatBoost, params: Dict):
        self.model_name = model_name
        self.model = model
        self.features = params['features']

    def score(
        self, target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        target_df = target_df.copy(deep=False)
        decoy_df = decoy_df.copy(deep=False)

        add_derived_features(target_df, decoy_df, decoy_ratio, self.features)

        target_df['msm'] = self.model.predict(target_df[self.features])
        decoy_df['msm'] = self.model.predict(decoy_df[self.features])

        # WORKAROUND: Annotations with 0/NaN spectral, spatial or chaos were excluded from training
        # because they seemed to reduce the overall performance of the models. Because of this,
        # models still give some valid score these annotations which sometimes leads to them
        # passing FDR filtering. Future work may be able to find a way to sometimes rescue these
        # annotations, but for now they just need to be excluded because the model doesn't know
        # how to handle them.
        # For now, just directly set their MSM to 0 to force their removal
        target_df.loc[lambda df: (df.spatial * df.spectral * df.chaos).fillna(0) <= 0, 'msm'] = 0
        decoy_df.loc[lambda df: (df.spatial * df.spectral * df.chaos).fillna(0) <= 0, 'msm'] = 0

        # The CatBoost models are normalized to 0-1 for the training data, but it's still possible
        # for the model to predict values outside this range for unseen data.
        # Values > 1.0 are a mainly cosmetic problem
        # Values < 0.0 would change the behavior of the worst-case FDR bin
        target_df.msm.clip(0.0, 1.0, inplace=True)
        decoy_df.msm.clip(0.0, 1.0, inplace=True)

        remove_uninteresting_features(target_df, decoy_df)

        return target_df, decoy_df


class MsmScoringModel(ScoringModel):
    def score(
        self, target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        # MSM column is already populated - just pass it through
        return target_df, decoy_df


def load_scoring_model(name: Optional[str]) -> ScoringModel:
    # Import DB locally so that Lithops doesn't try to pickle it & fail due to psycopg2
    # pylint: disable=import-outside-toplevel  # circular import
    from sm.engine.db import DB

    if name is None:
        return MsmScoringModel()

    row = DB().select_one("SELECT type, params FROM scoring_model WHERE name = %s", (name,))
    assert row, f'Scoring model {name} not found'
    type_, params = row

    if type_ == 'catboost':
        bucket, key = split_s3_path(params['s3_path'])
        with TemporaryDirectory() as tmpdir:
            model_file = Path(tmpdir) / 'model.cbm'
            with model_file.open('wb') as f:
                f.write(get_s3_client().get_object(Bucket=bucket, Key=key)['Body'].read())
            model = CatBoost()
            model.load_model(str(model_file), 'cbm')

        return CatBoostScoringModel(name, model, params)
    else:
        raise ValueError(f'Unsupported scoring model type: {type_}')


def upload_catboost_scoring_model(
    model: Union[CatBoost, Path, str],
    bucket: str,
    prefix: str,
    is_public: bool,
    train_data: pd.DataFrame = None,
):
    """
    Args:
        model: The catboost model or path to the CBM file. Must be trained on a DataFrame so that
               feature names are included
        bucket: Destination S3/MinIO bucket
        prefix: S3/MinIO prefix
        is_public: True to save with a 'public-read' ACL. False to use the bucket's default ACL
        train_data: (Optional) If provided it will be saved alongside the model. Not needed for
                    anything, but it may make future work easier.
    """
    version = None
    if isinstance(model, (Path, str)):
        model_path = Path(model)
        model = CatBoost().load_model(str(model_path), format='cbm')
        version_match = re.fullmatch(r'model-(.*)\.cbm', model_path.name)
        if version_match is not None:
            # Copy the version from the filename if there is one
            version = version_match[1]

    features = model.feature_names_
    assert features, 'Model should have feature_names_ set'

    with TemporaryDirectory() as tmpdir:
        # Save CBM (small, faster to load) and JSON (in case it's needed for forward compatibility)
        cbm_path = Path(tmpdir) / 'model.cbm'
        json_path = Path(tmpdir) / 'model.json'
        model.save_model(str(cbm_path), format='cbm')
        model.save_model(str(json_path), format='json')

        if version is None:
            # Add a timestamp and hash to the model path as a crude versioning mechanism,
            # so that it's possible to recover if the model is accidentally reuploaded
            timestamp = datetime.now().isoformat().replace(':', '-')
            version = f'{timestamp}-{sha1(cbm_path.read_bytes()).hexdigest()[:8]}'

        cbm_key = f'{prefix}/model-{version}.cbm'
        json_key = f'{prefix}/model-{version}.json'

        # Create the bucket if necessary
        s3_client = get_s3_client()
        try:
            s3_client.head_bucket(Bucket=bucket)
        except Exception:
            print(f"Couldn't find bucket {bucket}, creating...")
            s3_client.create_bucket(Bucket=bucket)

        acl = {'ACL': 'public-read'} if is_public else {}
        logger.info(f'Uploading CBM model to s3://{bucket}/{cbm_key}')
        s3_client.put_object(Bucket=bucket, Key=cbm_key, Body=cbm_path.read_bytes(), **acl)
        logger.info(f'Uploading JSON model to s3://{bucket}/{json_key}')
        s3_client.put_object(Bucket=bucket, Key=json_key, Body=json_path.read_bytes(), **acl)

        # Upload training data
        if train_data is not None:
            data_path = Path(tmpdir) / 'train_data.parquet'
            train_data.to_parquet(data_path)
            data_key = f'{prefix}/train_data-{version}.parquet'
            logger.info(f'Uploading training data to to s3://{bucket}/{data_key}')
            s3_client.put_object(Bucket=bucket, Key=data_key, Body=data_path.read_bytes(), **acl)

    return {
        's3_path': f's3://{bucket}/{cbm_key}',
        'features': features,
    }


def save_scoring_model_to_db(name, type_, params):
    """Adds/updates the scoring_model in the local database"""
    # Import DB locally so that Lithops doesn't try to pickle it & fail due to psycopg2
    # pylint: disable=import-outside-toplevel  # circular import
    from sm.engine.db import DB

    if not isinstance(params, str):
        params = json.dumps(params)

    db = DB()
    if db.select_one('SELECT * FROM scoring_model WHERE name = %s', (name,)):
        logger.info(f'Updating existing scoring model {name}')
        DB().alter(
            'UPDATE scoring_model SET type = %s, params = %s WHERE name = %s',
            (type_, params, name),
        )
    else:
        logger.info(f'Inserting new scoring model {name}')
        DB().alter(
            'INSERT INTO scoring_model(name, type, params) VALUES (%s, %s, %s)',
            (name, type_, params),
        )
