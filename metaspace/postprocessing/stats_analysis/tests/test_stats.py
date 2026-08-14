"""Unit tests for the pure-numerics layer of the stats pipeline."""
import math

import numpy as np
import pytest

from stats_analysis.stats import (
    benjamini_hochberg,
    compute_sample_qc,
    dunn_posthoc,
    nemenyi_posthoc,
    pca_2d,
    welch_ttest,
)


def test_welch_ttest_matches_scipy_for_known_inputs():
    a = np.array([1.0, 2.0, 3.0, 4.0])
    b = np.array([3.0, 4.0, 5.0, 6.0])
    t, p = welch_ttest(a, b)
    # Reference values via scipy.stats.ttest_ind(equal_var=False).
    assert t == pytest.approx(-2.1909, rel=1e-3)
    assert p == pytest.approx(0.0710, rel=1e-2)


def test_welch_ttest_returns_nan_when_degenerate():
    a = np.array([1.0, 1.0])
    b = np.array([1.0, 1.0])
    t, p = welch_ttest(a, b)
    assert math.isnan(t) and math.isnan(p)


def test_benjamini_hochberg_against_known_sequence():
    p_values = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205]
    fdr = benjamini_hochberg(p_values)
    expected = [0.008, 0.032, 0.0672, 0.0672, 0.0672, 0.08, 0.0846, 0.205]
    assert fdr == pytest.approx(expected, rel=1e-2)


def test_benjamini_hochberg_returns_nan_for_nan_input():
    fdr = benjamini_hochberg([0.01, math.nan, 0.5])
    assert math.isnan(fdr[1])


def test_pca_2d_returns_shape_and_variance():
    rng = np.random.default_rng(0)
    matrix = rng.standard_normal((6, 10))
    coords, variance = pca_2d(matrix)
    assert coords.shape == (6, 2)
    assert 0.0 <= variance['pc1'] <= 1.0
    assert 0.0 <= variance['pc2'] <= 1.0
    assert variance['pc1'] >= variance['pc2']


def test_pca_2d_handles_too_few_samples():
    matrix = np.array([[1.0, 2.0, 3.0]])
    coords, variance = pca_2d(matrix)
    assert coords.shape == (1, 2)
    assert variance == {'pc1': 0.0, 'pc2': 0.0}


def test_compute_sample_qc_reports_detection_and_cv():
    intensities = {
        's0': {1: 10.0, 2: 0.0, 3: 5.0},
        's1': {1: 0.0, 2: 0.0, 3: 0.0},
    }
    ions_total = 3
    qc = compute_sample_qc(intensities, ions_total)
    assert qc['s0']['detectionRate'] == pytest.approx(2 / 3)
    assert qc['s0']['cv'] == pytest.approx(np.std([10.0, 5.0], ddof=0) / 7.5, rel=1e-6)
    assert qc['s1']['detectionRate'] == 0.0
    assert qc['s1']['cv'] == 0.0


def test_dunn_posthoc_returns_pair_pvalues():
    rng = np.random.default_rng(0)
    arms = [rng.normal(0, 1, 12), rng.normal(0, 1, 12), rng.normal(3, 1, 12)]
    conds = ['ctrl', 'treated', 'shock']
    pairs = dunn_posthoc(arms, conds)
    assert set(pairs.keys()) == {('ctrl', 'shock'), ('ctrl', 'treated'), ('shock', 'treated')}
    assert all(0.0 <= p <= 1.0 for p in pairs.values())
    assert pairs[('ctrl', 'shock')] < 0.05
    assert pairs[('ctrl', 'treated')] > 0.05


def test_dunn_posthoc_canonical_pair_order():
    arms = [np.array([1.0, 2.0, 3.0]), np.array([2.0, 3.0, 4.0]), np.array([3.0, 4.0, 5.0])]
    pairs = dunn_posthoc(arms, ['b_cond', 'a_cond', 'c_cond'])
    for a, b in pairs:
        assert a < b


def test_nemenyi_posthoc_paired_returns_pair_pvalues():
    rng = np.random.default_rng(1)
    base = rng.normal(0, 1, 10)
    arms = [base, base + 0.1, base + 3.0]
    conds = ['t0', 't1', 't2']
    pairs = nemenyi_posthoc(arms, conds)
    assert set(pairs.keys()) == {('t0', 't1'), ('t0', 't2'), ('t1', 't2')}
    assert pairs[('t0', 't2')] < 0.05


def test_posthoc_degenerate_returns_nans():
    arms = [np.array([1.0]), np.array([2.0]), np.array([3.0])]
    pairs = dunn_posthoc(arms, ['a', 'b', 'c'])
    assert all(math.isnan(p) for p in pairs.values())
