"""Pure-numerics helpers used by the stats microservice runner.

No I/O; deterministic given inputs. Statistical functions are tested
against scipy reference values; helpers are tested against hand-built
fixtures.
"""
# pylint: disable=invalid-name  # short stats notation (p, t, b, cv) is conventional
from __future__ import annotations

import math
from typing import Dict, List, Tuple

import numpy as np
from scipy import stats as _scistats
from scipy import integrate as _sciintegrate
from sklearn.decomposition import PCA


def friedman_test(arms: List[np.ndarray]) -> Tuple[float, float]:
    """Friedman chi-square for k>=3 paired arms of equal length.

    Args:
        arms: list of 1-D ndarrays, one per condition; all same length, ordered
            so that arms[i][j] corresponds to the same biological replicate j.

    Returns:
        (statistic, p_value). NaN/NaN if degenerate (arm length < 2 or all
        arms identical to within zero variance).
    """
    if len(arms) < 3:
        return math.nan, math.nan
    n = arms[0].size
    if n < 2 or any(a.size != n for a in arms):
        return math.nan, math.nan
    if all(np.var(a) == 0 for a in arms):
        return math.nan, math.nan
    try:
        stat, p = _scistats.friedmanchisquare(*arms)
        return float(stat), float(p)
    except (ValueError, ZeroDivisionError):
        return math.nan, math.nan


def wilcoxon_paired(a: np.ndarray, b: np.ndarray) -> Tuple[float, float]:
    """Wilcoxon signed-rank for two equal-length paired arms."""
    if a.size != b.size or a.size < 2:
        return math.nan, math.nan
    diffs = b - a
    if np.all(diffs == 0):
        return math.nan, math.nan
    try:
        stat, p = _scistats.wilcoxon(a, b, zero_method='wilcox')
        return float(stat), float(p)
    except (ValueError, ZeroDivisionError):
        return math.nan, math.nan


def welch_ttest(a: np.ndarray, b: np.ndarray) -> Tuple[float, float]:
    """Two-sided Welch's t-test, returning (t, p). NaN/NaN if degenerate."""
    if len(a) < 2 or len(b) < 2 or (np.var(a) == 0 and np.var(b) == 0):
        return math.nan, math.nan
    t, p = _scistats.ttest_ind(a, b, equal_var=False)
    return float(t), float(p)


def benjamini_hochberg(p_values: List[float]) -> List[float]:
    """Return BH-adjusted q-values aligned with input order. NaNs pass through."""
    p_arr = np.array(p_values, dtype=np.float64)
    finite_mask = ~np.isnan(p_arr)
    finite = p_arr[finite_mask]
    n = finite.size
    if n == 0:
        return list(p_arr)
    order = np.argsort(finite)
    ranked = finite[order]
    adjusted = ranked * n / (np.arange(n) + 1)
    adjusted = np.minimum.accumulate(adjusted[::-1])[::-1]
    adjusted = np.minimum(adjusted, 1.0)
    out_finite = np.empty(n)
    out_finite[order] = adjusted
    out = np.full_like(p_arr, np.nan)
    out[finite_mask] = out_finite
    return [float(x) if not math.isnan(x) else math.nan for x in out]


def pca_2d(matrix: np.ndarray) -> Tuple[np.ndarray, Dict[str, float]]:
    """Run PCA(2) on a (samples x ions) matrix.

    Returns ``(coords, variance)`` where ``coords`` has shape (n_samples, 2)
    and ``variance`` maps ``'pc1'`` and ``'pc2'`` to the proportion of
    variance explained. Degenerate inputs return zeros.
    """
    n_samples, n_features = matrix.shape
    if n_samples < 2 or n_features < 2:
        return np.zeros((n_samples, 2)), {'pc1': 0.0, 'pc2': 0.0}
    pca = PCA(n_components=2)
    coords = pca.fit_transform(matrix)
    return coords, {
        'pc1': float(pca.explained_variance_ratio_[0]),
        'pc2': float(pca.explained_variance_ratio_[1]),
    }


def compute_sample_qc(
    intensities: Dict[str, Dict[int, float]], ions_total: int
) -> Dict[str, Dict[str, float]]:
    """Per-sample detection rate + coefficient of variation over detected ions."""
    out: Dict[str, Dict[str, float]] = {}
    for sample_id, ion_map in intensities.items():
        detected_vals = np.array([v for v in ion_map.values() if v > 0.0], dtype=np.float64)
        detection_rate = float(detected_vals.size / ions_total) if ions_total else 0.0
        if detected_vals.size == 0:
            cv = 0.0
        else:
            mean = float(detected_vals.mean())
            cv = float(detected_vals.std() / mean) if mean > 0 else 0.0
        out[sample_id] = {'detectionRate': detection_rate, 'cv': cv}
    return out


def _canonical_pair(a: str, b: str) -> Tuple[str, str]:
    return (a, b) if a < b else (b, a)


def dunn_posthoc(arms: List[np.ndarray], conditions: List[str]) -> Dict[Tuple[str, str], float]:
    """Dunn's test with Bonferroni correction across pairs.

    Post-hoc for Kruskal-Wallis. Each returned p-value is already adjusted
    for the multiple-condition comparison (within one ion); the caller
    applies BH across ions separately.
    """
    k = len(arms)
    if k < 2 or len(conditions) != k:
        return {}
    if any(a.size < 2 for a in arms):
        return {
            _canonical_pair(conditions[i], conditions[j]): math.nan
            for i in range(k)
            for j in range(i + 1, k)
        }

    sizes = [a.size for a in arms]
    all_vals = np.concatenate(arms)
    if np.var(all_vals) == 0:
        return {
            _canonical_pair(conditions[i], conditions[j]): math.nan
            for i in range(k)
            for j in range(i + 1, k)
        }
    ranks = _scistats.rankdata(all_vals)

    offsets = np.cumsum([0] + sizes)
    mean_ranks = [ranks[offsets[i] : offsets[i + 1]].mean() for i in range(k)]
    N = all_vals.size
    n_pairs = k * (k - 1) // 2

    out: Dict[Tuple[str, str], float] = {}
    for i in range(k):
        for j in range(i + 1, k):
            se = math.sqrt(N * (N + 1) / 12.0 * (1.0 / sizes[i] + 1.0 / sizes[j]))
            if se == 0:
                p = math.nan
            else:
                z = abs(mean_ranks[i] - mean_ranks[j]) / se
                p_unadj = 2.0 * (1.0 - _scistats.norm.cdf(z))
                p = float(min(1.0, p_unadj * n_pairs))
            out[_canonical_pair(conditions[i], conditions[j])] = p
    return out


def _studentized_range_sf_inf(q: float, k: int) -> float:
    """Upper-tail probability of the studentized range with infinite df.

    Tukey's formula: P(Q <= q) = k * int phi(u) * [Phi(u) - Phi(u-q)]^(k-1) du.
    Implemented here so the module works on scipy < 1.7 (which lacks
    ``scipy.stats.studentized_range``).
    """
    if not math.isfinite(q) or q <= 0 or k < 2:
        return 1.0
    norm_pdf = _scistats.norm.pdf
    norm_cdf = _scistats.norm.cdf

    def integrand(u: float) -> float:
        return norm_pdf(u) * (norm_cdf(u) - norm_cdf(u - q)) ** (k - 1)

    val, _ = _sciintegrate.quad(integrand, -8.0, 8.0, limit=200)
    cdf = max(0.0, min(1.0, k * val))
    return max(0.0, min(1.0, 1.0 - cdf))


def nemenyi_posthoc(arms: List[np.ndarray], conditions: List[str]) -> Dict[Tuple[str, str], float]:
    """Nemenyi post-hoc for Friedman test (paired k>=3).

    Arms must be aligned by block (same length, arm[i][j] is the same
    subject j's value under condition i). Returns Tukey-studentized-range
    p-values (computed numerically; no scipy.stats.studentized_range
    dependency, so this works on scipy 1.6).
    """
    k = len(arms)
    if k < 2 or len(conditions) != k:
        return {}
    n = arms[0].size if k else 0
    if n < 2 or any(a.size != n for a in arms):
        return {
            _canonical_pair(conditions[i], conditions[j]): math.nan
            for i in range(k)
            for j in range(i + 1, k)
        }

    M = np.column_stack(arms)
    ranks = np.apply_along_axis(_scistats.rankdata, 1, M)
    mean_ranks = ranks.mean(axis=0)

    se = math.sqrt(k * (k + 1) / (6.0 * n))
    out: Dict[Tuple[str, str], float] = {}
    for i in range(k):
        for j in range(i + 1, k):
            if se == 0:
                p = math.nan
            else:
                q = abs(mean_ranks[i] - mean_ranks[j]) / se
                # Convert to studentized-range scale: multiply by sqrt(2).
                p = _studentized_range_sf_inf(q * math.sqrt(2.0), k)
            out[_canonical_pair(conditions[i], conditions[j])] = p
    return out
