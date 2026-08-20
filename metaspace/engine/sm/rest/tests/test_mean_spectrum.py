"""Tests for the mean spectrum reference-axis construction.

The load-bearing test here is `test_matches_naive_reference`: the production
implementation adds a vectorised gap pre-pass and reduceat aggregation on top of
MALDIquant's strict rule, and those must not change the result relative to a direct
transcription of the algorithm.
"""

import numpy as np
import pytest

from sm.engine.annotation.isocalc_wrapper import mass_accuracy_half_width
from sm.rest.mean_spectrum_manager import (
    _format_peak_count,
    build_reference_axis_strict,
    select_top_peaks,
)

INSTRUMENTS = ['TOF', 'Orbitrap', 'FTICR']


def naive_reference_axis(mzs, ints, pix, instrument, ppm, n_pixels, min_support_frac=0.01):
    """Direct transcription of the spec's pseudocode -- no pre-pass, no vectorisation."""
    mzs = np.asarray(mzs, dtype=np.float64)
    ints = np.asarray(ints, dtype=np.float64)
    pix = np.asarray(pix)
    if len(mzs) == 0:
        return np.array([]), np.array([]), np.array([], dtype=np.int64)

    clusters = []
    stack = [np.arange(len(mzs))]
    while stack:
        idx = stack.pop()
        if len(idx) == 1:
            clusters.append(idx)
            continue

        sub_mzs = mzs[idx]
        tol = mass_accuracy_half_width(float(sub_mzs.mean()), instrument, ppm)
        within_tol = (sub_mzs.max() - sub_mzs.min()) <= tol
        no_dup_pixels = len(np.unique(pix[idx])) == len(idx)

        if within_tol and no_dup_pixels:
            clusters.append(idx)
            continue

        split_at = int(np.argmax(np.diff(sub_mzs))) + 1
        stack.append(idx[:split_at])
        stack.append(idx[split_at:])

    clusters.sort(key=lambda c: c[0])
    ref_mzs, agg_int, support = [], [], []
    for idx in clusters:
        w = ints[idx]
        ref_mzs.append(np.average(mzs[idx], weights=w) if w.sum() > 0 else mzs[idx][0])
        agg_int.append(w.sum())
        support.append(len(np.unique(pix[idx])))

    ref_mzs = np.array(ref_mzs)
    agg_int = np.array(agg_int)
    support = np.array(support, dtype=np.int64)

    keep = support >= max(3, min_support_frac * n_pixels)
    return ref_mzs[keep], agg_int[keep], support[keep]


def _random_peaks(rng, n_pixels, peaks_per_pixel, scatter_ppm, mz_range=(100.0, 900.0)):
    """Peaks from `n_pixels` pixels around shared true masses, with per-spectrum scatter."""
    true_mzs = rng.uniform(*mz_range, size=peaks_per_pixel)
    mzs, pix, ints = [], [], []
    for p in range(n_pixels):
        jitter = true_mzs * (1 + rng.normal(0, scatter_ppm * 1e-6, size=peaks_per_pixel))
        mzs.append(jitter)
        pix.append(np.full(peaks_per_pixel, p))
        ints.append(rng.uniform(1, 1000, size=peaks_per_pixel))

    mzs = np.concatenate(mzs)
    pix = np.concatenate(pix)
    ints = np.concatenate(ints)
    order = np.argsort(mzs, kind='stable')
    return mzs[order], ints[order], pix[order]


@pytest.mark.parametrize('instrument', INSTRUMENTS)
@pytest.mark.parametrize('scatter_ppm', [1.0, 5.0, 25.0])
def test_matches_naive_reference(instrument, scatter_ppm):
    """The pre-pass and reduceat rewrite must be exactly equivalent to the plain rule."""
    rng = np.random.default_rng(42)
    n_pixels = 40
    mzs, ints, pix = _random_peaks(rng, n_pixels, peaks_per_pixel=30, scatter_ppm=scatter_ppm)

    got = build_reference_axis_strict(mzs, ints, pix, instrument, ppm=3.0, n_pixels=n_pixels)
    expected = naive_reference_axis(mzs, ints, pix, instrument, ppm=3.0, n_pixels=n_pixels)

    np.testing.assert_allclose(got[0], expected[0], rtol=1e-12)
    np.testing.assert_allclose(got[1], expected[1], rtol=1e-12)
    np.testing.assert_array_equal(got[2], expected[2])


def test_empty_input():
    ref_mzs, ints, support = build_reference_axis_strict(
        np.array([]), np.array([]), np.array([]), 'TOF', 3.0, n_pixels=10
    )
    assert len(ref_mzs) == 0 and len(ints) == 0 and len(support) == 0


def test_single_peak_is_filtered_by_support_floor():
    """One peak means support=1, below the absolute floor of 3."""
    ref_mzs, _, _ = build_reference_axis_strict(
        np.array([200.0]), np.array([5.0]), np.array([0]), 'TOF', 3.0, n_pixels=1
    )
    assert len(ref_mzs) == 0


def test_identical_mzs_collapse_to_one_cluster():
    """The continuous-mode shape: every pixel reports the exact same m/z."""
    n_pixels = 10
    mzs = np.full(n_pixels, 300.0)
    ints = np.arange(1, n_pixels + 1, dtype=float)
    pix = np.arange(n_pixels)

    ref_mzs, summed, support = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 3.0, n_pixels=n_pixels
    )

    assert len(ref_mzs) == 1
    assert ref_mzs[0] == pytest.approx(300.0)
    assert summed[0] == pytest.approx(ints.sum())
    assert support[0] == n_pixels


def test_strict_rule_splits_duplicate_pixel():
    """Two peaks from one pixel within tolerance must not share a cluster."""
    # 4 pixels' worth of peaks tightly around 400.0, but pixel 0 contributes twice.
    mzs = np.array([399.9990, 399.9995, 400.0000, 400.0005, 400.0010])
    ints = np.ones(5)
    pix = np.array([0, 0, 1, 2, 3])

    # A generous 100 ppm window comfortably spans all five peaks, so only the strict
    # duplicate-pixel rule can force a split here.
    _, _, support = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 100.0, n_pixels=4, min_support_pixels=1
    )
    assert len(support) >= 2
    assert support.sum() == 5


def test_support_filter_fraction_applies_on_large_region():
    """1% of 1000 pixels = 10, so a 5-pixel cluster is dropped."""
    mzs = np.linspace(500.0, 500.000004, 5)
    ints = np.ones(5)
    pix = np.arange(5)

    ref_mzs, _, _ = build_reference_axis_strict(mzs, ints, pix, 'TOF', 3.0, n_pixels=1000)
    assert len(ref_mzs) == 0

    ref_mzs, _, _ = build_reference_axis_strict(mzs, ints, pix, 'TOF', 3.0, n_pixels=100)
    assert len(ref_mzs) == 1


def test_intensity_weighted_centroid():
    """The reported m/z is the intensity-weighted centroid, not the most intense peak."""
    mzs = np.array([400.0000, 400.0004, 400.0008])
    ints = np.array([1.0, 1.0, 2.0])
    pix = np.array([0, 1, 2])

    ref_mzs, summed, _ = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 10.0, n_pixels=3, min_support_pixels=1
    )
    assert len(ref_mzs) == 1
    assert ref_mzs[0] == pytest.approx(np.average(mzs, weights=ints))
    # ...and is distinguishable from the most intense peak's raw m/z
    assert abs(ref_mzs[0] - 400.0008) > 1e-5
    assert summed[0] == pytest.approx(4.0)


def test_select_top_peaks_returns_mz_sorted_subset():
    ref_mzs = np.array([100.0, 200.0, 300.0, 400.0, 500.0])
    summed = np.array([5.0, 1.0, 4.0, 2.0, 3.0])
    support = np.array([5, 1, 4, 2, 3], dtype=np.int64)

    got_mzs, got_ints, got_support = select_top_peaks(ref_mzs, summed, support, max_points=3)

    assert got_mzs.tolist() == [100.0, 300.0, 500.0]
    assert got_ints.tolist() == [5.0, 4.0, 3.0]
    assert got_support.tolist() == [5, 4, 3]
    assert np.all(np.diff(got_mzs) > 0)


@pytest.mark.parametrize(
    'n, expected',
    [
        (102_216_984, 'over 100 million'),
        (30_000_000, '30 million'),
        (10_000_000, '10 million'),
        (8_432_100, 'over 8 million'),
        (45_678_901, 'over 45 million'),
        (999_999, '999,999'),
    ],
)
def test_format_peak_count(n, expected):
    assert _format_peak_count(n) == expected


def test_select_top_peaks_passthrough_when_under_cap():
    ref_mzs = np.array([1.0, 2.0])
    summed = np.array([1.0, 2.0])
    support = np.array([1, 2], dtype=np.int64)

    got = select_top_peaks(ref_mzs, summed, support, max_points=10)
    np.testing.assert_array_equal(got[0], ref_mzs)
