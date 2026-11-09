from functools import partial

import numpy as np
import pytest

from sm.engine.annotation import fdr
from tests.consistency.refs import check_ref
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency


def test_rng_stream_matches_reference():
    np.random.seed(42)
    shuffles = []
    for _ in range(5):
        items = list(fdr.DECOY_ADDUCTS)
        np.random.shuffle(items)
        shuffles.append(items)
    check_ref('rng/seed42', {'shuffles': shuffles}, partial(assert_tree, tol=None))
