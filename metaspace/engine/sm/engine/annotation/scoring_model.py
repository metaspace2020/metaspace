from pathlib import Path
from tempfile import TemporaryDirectory
from typing import List, Tuple, Dict, Optional

import numpy as np
import pandas as pd
from catboost import CatBoost


def add_derived_features(
    target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float, features: List[str]
):
    """Adds extra feature columns needed for the model to target_df and decoy_df.
    This is separate from the metric calculation in formula_validator as these derived features
    require statistics from a full ranking of targets & decoys, which isn't available in
    formula_validator .
    """
    from sm.engine.annotation.fdr import score_to_fdr_map  # circular import

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

        return target_df, decoy_df


class MsmScoringModel(ScoringModel):
    def score(
        self, target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        # MSM column is already populated - just pass it through
        return target_df, decoy_df


def load_scoring_model(name: Optional[str]) -> ScoringModel:
    # Import DB locally so that Lithops doesn't try to pickle it & fail due to psycopg2
    from sm.engine.db import DB  # pylint: disable=import-outside-toplevel
    from sm.engine.storage import get_s3_client
    from sm.engine.util import split_s3_path

    if name is None:
        return MsmScoringModel()

    row = DB().select_one("SELECT type, params FROM scoring_model WHERE name = %s", (name,))
    assert row is not None, f'Scoring model {name} not found'
    type, params = row

    if type == 'catboost':
        bucket, key = split_s3_path(params['s3_path'])
        with TemporaryDirectory() as tmpdir:
            model_file = Path(tmpdir) / 'model.cbm'
            with model_file.open('wb') as f:
                f.write(get_s3_client().get_object(Bucket=bucket, Key=key)['Body'].read())
            model = CatBoost()
            model.load_model(str(model_file), 'cbm')

        return CatBoostScoringModel(name, model, params)
    else:
        raise ValueError(f'Unsupported scoring model type: {type}')
