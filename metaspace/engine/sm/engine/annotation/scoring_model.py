from typing import List, Tuple

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
            target_values,
            decoy_values,
            decoy_ratio,
            rule_of_succession=False,
            monotonic=True,
        )
        target_df[fdr_feature] = fdr_map.loc[target_values].values
        decoy_df[fdr_feature] = fdr_map.loc[decoy_values].values


class ScoringModel:
    def score(
        self, target_df: pd.DataFrame, decoy_df: pd.DataFrame, decoy_ratio: float
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Processes the targets & decoys from one FDR ranking and returns the dataframes with the
        'msm' column populated with the computed score, and potentially other columns added if they
        would help explain the score."""
        raise NotImplementedError()


class CatBoostScoringModel(ScoringModel):
    def __init__(self, model_name: str, model: CatBoost, features: List[str]):
        self.model_name = model_name
        self.model = model
        self.features = features

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
