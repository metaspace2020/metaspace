from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from sm.engine.annotation.qc.metadata import analyzer_family
from sm.engine.annotation.qc.report import CheckResult, Evidence

TIER = 'B'
Spectrum = Tuple[np.ndarray, np.ndarray]
MIN_GAPS_FOR_SCORE = 50
MIN_GAPS_PER_WINDOW = 10


def _result(name: str, **kwargs) -> CheckResult:
    return CheckResult(name=name, tier=TIER, **kwargs)


def _sorted_spectra(spectra: Sequence[Spectrum]) -> List[Spectrum]:
    out = []
    for mzs, ints in spectra:
        if len(mzs) >= 2:
            order = np.argsort(mzs, kind='stable')
            out.append((mzs[order].astype(np.float64), ints[order].astype(np.float64)))
    return out


def fwhm_ppm(mzs: np.ndarray, resolving_power: float, rp_mz: float, family: Optional[str]):
    """Peak width in ppm at each m/z, from the resolving power the form declares at rp_mz."""
    if family == 'orbitrap':
        resolution = resolving_power * np.sqrt(rp_mz / mzs)
    elif family == 'fticr':
        resolution = resolving_power * rp_mz / mzs
    else:
        resolution = np.full(len(mzs), float(resolving_power))
    return 1e6 / resolution


def _gaps(sorted_spectra: Sequence[Spectrum]) -> Tuple[np.ndarray, np.ndarray]:
    """Pooled adjacent-peak gaps in Da, with the lower m/z of each gap."""
    if not sorted_spectra:
        return np.empty(0), np.empty(0)
    gaps = np.concatenate([np.diff(mzs) for mzs, _ in sorted_spectra])
    lows = np.concatenate([mzs[:-1] for mzs, _ in sorted_spectra])
    positive = (gaps > 0) & (lows > 0)
    return gaps[positive], lows[positive]


def _form_resolution(form: Dict[str, Any]):
    try:
        return float(form['resolving_power']), float(form['resolving_power_mz'])
    except (KeyError, TypeError, ValueError):
        return None


def proxy_a(gaps: np.ndarray, lows: np.ndarray, form: Dict[str, Any], fraction: float):
    """Fraction of gaps shorter than a fraction of the declared peak width."""
    resolution = _form_resolution(form)
    if resolution is None or len(gaps) < MIN_GAPS_FOR_SCORE:
        return None
    width = fwhm_ppm(lows, *resolution, analyzer_family(form.get('analyzer')))
    return float(np.mean(gaps / lows * 1e6 < fraction * width))


def proxy_a_self(gaps: np.ndarray, lows: np.ndarray):
    """Form-independent: centroid gaps spread over decades and profile steps cluster, so the
    ratio of the 5th percentile to the median of the gaps (in ppm) is high for profile data."""
    if len(gaps) < MIN_GAPS_FOR_SCORE:
        return None
    ppm = gaps / lows * 1e6
    p05, median = np.percentile(ppm, [5, 50])
    return float(p05 / median)


def _run_lengths(flags: np.ndarray) -> np.ndarray:
    idx = np.arange(len(flags))
    return idx - np.maximum.accumulate(np.where(~flags, idx, -1))


def proxy_b(sorted_spectra: Sequence[Spectrum], side: int):
    """Fraction of local maxima that rise and fall monotonically for at least ``side`` steps
    each way. Independent noise gives about 1% for side=3."""
    n_maxima = n_smooth = 0
    for _, ints in sorted_spectra:
        if len(ints) < 2 * side + 1:
            continue
        step = np.diff(ints)
        rise = _run_lengths(step > 0)[:-1]
        fall = _run_lengths((step < 0)[::-1])[::-1][1:]
        is_max = (step[:-1] > 0) & (step[1:] < 0)
        n_maxima += int(is_max.sum())
        n_smooth += int((is_max & (rise >= side) & (fall >= side)).sum())
    return n_smooth / n_maxima if n_maxima >= MIN_GAPS_PER_WINDOW else None


def proxy_c(gaps: np.ndarray, lows: np.ndarray, log_width: float):
    """Median coefficient of variation of the gap size within narrow m/z windows."""
    if len(gaps) < MIN_GAPS_FOR_SCORE:
        return None
    window = np.floor(np.log(lows) / log_width).astype(np.int64)
    _, inverse, counts = np.unique(window, return_inverse=True, return_counts=True)
    mean = np.bincount(inverse, weights=gaps) / counts
    mean_sq = np.bincount(inverse, weights=gaps ** 2) / counts
    variation = np.sqrt(np.maximum(mean_sq - mean ** 2, 0)) / mean
    enough = counts >= MIN_GAPS_PER_WINDOW
    return float(np.median(variation[enough])) if enough.any() else None


def _clip01(value: float) -> float:
    return float(min(max(value, 0.0), 1.0))


def check_profile_likeness(
    spectra: Sequence[Spectrum], form: Dict[str, Any], cfg: Dict[str, Any]
) -> CheckResult:
    sorted_spectra = _sorted_spectra(spectra)
    gaps, lows = _gaps(sorted_spectra)
    counts = [len(mzs) for mzs, _ in spectra]
    a_form = proxy_a(gaps, lows, form, cfg['gap_width_fraction'])
    a_self = proxy_a_self(gaps, lows)
    b_score = proxy_b(sorted_spectra, cfg['min_run_side'])
    c_cv = proxy_c(gaps, lows, cfg['window_log_width'])
    median_count = float(np.median(counts)) if counts else None

    parts = {
        'a': a_form if a_form is not None else a_self,
        'b': b_score,
        'c': None if c_cv is None else _clip01(1 - c_cv),
        'd': None if not median_count else _clip01((np.log10(median_count) - 2.5) / 1.5),
    }
    available = {k: v for k, v in parts.items() if v is not None}
    weight_sum = sum(cfg['weights'][k] for k in available)
    score = (
        sum(cfg['weights'][k] * v for k, v in available.items()) / weight_sum if available else None
    )
    fail_above = cfg.get('fail_above')
    return _result(
        'profile_likeness',
        value=score,
        threshold=fail_above,
        evidence=Evidence.INFERRED if score is not None else Evidence.NOT_ASSESSABLE,
        would_block=fail_above is not None and score is not None and score > fail_above,
        details={
            'proxy_a_form': a_form,
            'proxy_a_self': a_self,
            'proxy_b': b_score,
            'proxy_c_median_cv': c_cv,
            'proxy_d_median_peaks': median_count,
            'components': parts,
            'n_gaps': int(len(gaps)),
            'n_spectra': len(sorted_spectra),
        },
    )


def check_mz_order(spectra: Sequence[Spectrum], cfg: Dict[str, Any]) -> CheckResult:
    unsorted = duplicated = 0
    for mzs, _ in spectra:
        step = np.diff(mzs)
        unsorted += bool((step < 0).any())
        duplicated += bool((step == 0).any())
    n_spectra = max(len(spectra), 1)
    limit = cfg.get('duplicate_fraction_fail')
    return _result(
        'mz_order',
        value=unsorted / n_spectra,
        evidence=Evidence.DIRECT,
        threshold=limit,
        would_block=limit is not None and duplicated / n_spectra > limit,
        details={'duplicate_fraction': duplicated / n_spectra, 'n_sampled': len(spectra)},
    )


def check_saturation(spectra: Sequence[Spectrum], cfg: Dict[str, Any]) -> CheckResult:
    maxima = np.array([ints.max() for _, ints in spectra if len(ints)])
    if len(maxima) == 0:
        return _result('saturation', evidence=Evidence.NOT_ASSESSABLE)
    top = maxima.max()
    share = float(np.mean(maxima == top))
    n_at_top = int(sum(np.count_nonzero(ints == top) for _, ints in spectra))
    limit = cfg.get('fail_above')
    return _result(
        'saturation',
        value=share,
        threshold=limit,
        evidence=Evidence.DIRECT,
        would_block=limit is not None and share > limit,
        details={'max_intensity': float(top), 'n_peaks_at_max': n_at_top},
    )


def check_intensity_transform(spectra: Sequence[Spectrum]) -> CheckResult:
    pooled = np.concatenate([ints for _, ints in spectra if len(ints)] or [np.empty(0)])
    positive = pooled[pooled > 0]
    if len(positive) == 0:
        return _result('intensity_transform', evidence=Evidence.NOT_ASSESSABLE)
    maxima = np.array([ints.max() for _, ints in spectra if len(ints)])
    p01, p99 = np.percentile(positive, [1, 99])
    hints = {
        'integer_valued': bool(np.all(positive == np.round(positive))),
        'round_number_max': bool(np.isclose(maxima.max(), [1, 100, 1000, 10000]).any()),
        'same_max_in_most_spectra': bool(np.mean(maxima == maxima.max()) > 0.5),
        'narrow_dynamic_range': bool(p99 / p01 < 10),
    }
    return _result(
        'intensity_transform',
        value=sum(hints.values()),
        evidence=Evidence.INFERRED,
        details=dict(hints, p01=float(p01), p99=float(p99)),
    )


def check_near_floor(spectra: Sequence[Spectrum], cfg: Dict[str, Any]) -> CheckResult:
    near = total = 0
    per_spectrum = []
    for _, ints in spectra:
        positive = ints[ints > 0]
        if len(positive) < 2:
            continue
        floor = np.percentile(positive, cfg['floor_percentile'])
        flagged = int((positive <= cfg['floor_multiple'] * floor).sum())
        near, total = near + flagged, total + len(positive)
        per_spectrum.append(flagged / len(positive))
    if total == 0:
        return _result('near_floor', evidence=Evidence.NOT_ASSESSABLE)
    return _result(
        'near_floor',
        value=near / total,
        evidence=Evidence.DIRECT,
        details={'median_per_spectrum': float(np.median(per_spectrum)), 'n_peaks': total},
    )


def check_sample_values(spectra: Sequence[Spectrum]) -> CheckResult:
    """Counts of invalid values in the raw sample. This is where negative and NaN intensities are
    still visible, because the full load strips them."""
    if not spectra:
        return _result('sample_values', evidence=Evidence.NOT_ASSESSABLE)
    mzs = np.concatenate([m for m, _ in spectra]).astype(np.float64)
    ints = np.concatenate([i for _, i in spectra]).astype(np.float64)
    counts = {
        'non_finite_mz': int((~np.isfinite(mzs)).sum()),
        'non_positive_mz': int((mzs <= 0).sum()),
        'nan_intensity': int(np.isnan(ints).sum()),
        'infinite_intensity': int(np.isinf(ints).sum()),
        'negative_intensity': int((ints < 0).sum()),
    }
    invalid = sum(counts.values())
    return _result(
        'sample_values',
        value=invalid,
        threshold=0,
        evidence=Evidence.DIRECT,
        would_block=invalid > 0,
        details=dict(counts, n_peaks=int(len(mzs)), zero_intensity=int((ints == 0).sum())),
    )
