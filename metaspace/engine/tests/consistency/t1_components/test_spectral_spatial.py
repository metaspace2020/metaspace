from functools import partial

import numpy as np
import pytest

from sm.engine.annotation.metrics import spatial_metric, spectral_metric
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_image_cases
from tests.consistency.tolerances import assert_close, assert_tree

pytestmark = pytest.mark.consistency


def test_spectral_matches_reference():
    actual = {c.name: float(spectral_metric(c.flat, c.theo_ints)) for c in make_image_cases()}
    assert any(v > 0 for v in actual.values())
    check_ref('spectral/v1', actual, partial(assert_tree, tol='NUM_METRIC'))


def test_spectral_degenerate_input_returns_zero():
    empty = np.zeros_like(make_image_cases()[0].flat)
    score = spectral_metric(empty, make_image_cases()[0].theo_ints)
    assert np.isfinite(score)
    assert score == 0


@pytest.mark.parametrize('v1_impl', [True, False])
def test_spatial_matches_reference(v1_impl):
    actual = {
        c.name: float(spatial_metric(c.flat, c.n_spectra, c.theo_ints, v1_impl=v1_impl))
        for c in make_image_cases()
    }
    assert any(v > 0 for v in actual.values())
    tol = 'NUM_METRIC' if v1_impl else 'NUM_ORDER'
    check_ref('spatial/v1' if v1_impl else 'spatial/v3', actual, partial(assert_tree, tol=tol))


def test_spatial_impls_agree_within_order_tolerance():
    checked = 0
    for case in make_image_cases():
        nonzero_peaks = np.count_nonzero(case.flat.any(axis=1))
        if nonzero_peaks < 2 or np.count_nonzero(case.flat[0]) < 2:
            continue
        v1 = spatial_metric(case.flat, case.n_spectra, case.theo_ints, v1_impl=True)
        v3 = spatial_metric(case.flat, case.n_spectra, case.theo_ints, v1_impl=False)
        assert_close(v3, v1, 'NUM_ORDER', label=case.name)
        checked += 1
    assert checked >= 2
