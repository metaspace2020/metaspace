import numpy as np
import pytest

from sm.engine.annotation.scoring_model import CatBoostScoringModel
from tests.consistency import refs
from tests.consistency.synth import make_scoring_frames
from tests.consistency.tolerances import assert_close
from tests.consistency.t0_env.test_catboost_parity import FEATURES, load_model

pytestmark = pytest.mark.consistency


def test_scoring_model_score_matches_reference():
    target, decoy = make_scoring_frames()
    model = CatBoostScoringModel('tiny', load_model(), {'features': FEATURES}, 1, 'tiny', 'v1')
    target_scored, decoy_scored = model.score(target, decoy, 20)

    for scored, original in [(target_scored, target), (decoy_scored, decoy)]:
        assert scored.msm.between(0, 1).all()
        zero_rows = (original.chaos * original.spatial * original.spectral) <= 0
        assert zero_rows.any()
        assert (scored.msm[zero_rows] == 0).all()
        assert (scored.msm > 0).any()

    def compare(actual, expected):
        assert_close(actual['target'], expected['target'], 'NUM_METRIC', 'target msm')
        assert_close(actual['decoy'], expected['decoy'], 'NUM_METRIC', 'decoy msm')

    actual = {'target': target_scored.msm.values, 'decoy': decoy_scored.msm.values}
    refs.check_ref('catboost/scoring', actual, compare)
    assert np.isfinite(actual['target']).all()
