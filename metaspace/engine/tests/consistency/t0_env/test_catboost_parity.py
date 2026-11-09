from pathlib import Path

import numpy as np
import pytest
from catboost import CatBoost, CatBoostRegressor

from sm.engine.annotation import scoring_model
from tests.consistency import refs
from tests.consistency.synth import make_scoring_frames
from tests.consistency.tolerances import assert_close

pytestmark = pytest.mark.consistency

FEATURES = ['chaos', 'spatial', 'spectral', 'chaos_fdr', 'mz_err_abs_fdr']


def model_path() -> Path:
    return Path(refs.REF_DIR) / 'catboost' / 'tiny_model.cbm'


def build_features():
    target, decoy = make_scoring_frames()
    scoring_model.add_derived_features(target, decoy, 20, FEATURES)
    return target, decoy


def _regenerate():
    target, decoy = build_features()
    features = np.vstack([target[FEATURES].values, decoy[FEATURES].values])
    labels = np.concatenate([np.ones(len(target)), np.zeros(len(decoy))])
    model = CatBoostRegressor(iterations=20, depth=3, random_seed=0, verbose=False, thread_count=1)
    model.fit(features, labels)
    model_path().parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(model_path()), format='cbm')
    refs.write_ref('catboost/features', {'x': features})


def load_model() -> CatBoost:
    model = CatBoost()
    model.load_model(str(model_path()), 'cbm')
    return model


def test_cbm_predictions_match_reference():
    if refs.regen_mode():
        _regenerate()
    features = np.array(refs.load_ref('catboost/features')['data']['x'])
    predictions = load_model().predict(features)
    assert np.ptp(predictions) > 0

    def compare(actual, expected):
        assert_close(actual['y'], expected['y'], 'NUM_METRIC', 'predictions')

    refs.check_ref('catboost/predictions', {'y': predictions}, compare)
