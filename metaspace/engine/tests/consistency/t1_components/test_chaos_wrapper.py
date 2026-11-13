from functools import partial

import pytest
from scipy.sparse import coo_matrix

from sm.engine.annotation.metrics import chaos_metric
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_image_cases
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency


def test_chaos_metric_matches_reference():
    actual = {case.name: float(chaos_metric(case.images[0], 30)) for case in make_image_cases()}
    assert any(v > 0 for v in actual.values())
    check_ref('chaos/v1/wrapper', actual, partial(assert_tree, tol=None))


def test_chaos_metric_empty_inputs_return_zero():
    assert chaos_metric(None, 30) == 0
    assert chaos_metric(coo_matrix((5, 5)), 30) == 0
