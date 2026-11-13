import math
from functools import partial

import pytest
from cpyImagingMSpec import measure_of_chaos

from tests.consistency.refs import check_ref
from tests.consistency.synth import make_dense_arrays
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency


@pytest.mark.parametrize('n_levels', [10, 30])
def test_measure_of_chaos_matches_reference(n_levels):
    actual = {name: float(measure_of_chaos(arr, n_levels)) for name, arr in make_dense_arrays()}
    assert math.isnan(actual['all_zero'])
    assert any(0.0 < v < 1.0 for v in actual.values())
    check_ref(f'chaos/kernel_n{n_levels}', actual, partial(assert_tree, tol=None))
