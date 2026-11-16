from typing import Any, Dict, NamedTuple, Optional, Sequence

import numpy as np

from sm.engine.annotation.qc.report import CheckResult, Evidence

TIER_C1 = 'C1'
TIER_C2 = 'C2'
CHUNK = 10_000_000
NEIGHBOUR_OFFSETS = [(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0)]
MIN_TIC_PIXELS = 10


def _result(name: str, tier: str, **kwargs) -> CheckResult:
    return CheckResult(name=name, tier=tier, **kwargs)


def _count_chunked(arr: np.ndarray, fn) -> int:
    return int(sum(fn(arr[i : i + CHUNK]).sum() for i in range(0, len(arr), CHUNK)))


def check_array_validity(mzs: np.ndarray, ints: np.ndarray) -> CheckResult:
    """Non-finite or non-positive m/z, and infinite intensities. NaN and negative intensities
    are already removed by the reader, so only the stripped fraction reports them."""
    bad_mz = _count_chunked(mzs, lambda a: ~np.isfinite(a))
    nonpositive_mz = _count_chunked(mzs, lambda a: a <= 0)
    inf_ints = _count_chunked(ints, np.isinf)
    total = bad_mz + nonpositive_mz + inf_ints
    return _result(
        'array_validity',
        TIER_C1,
        value=total,
        threshold=0,
        evidence=Evidence.DIRECT,
        would_block=total > 0,
        details={
            'n_peaks': int(len(mzs)),
            'non_finite_mz': bad_mz,
            'non_positive_mz': nonpositive_mz,
            'infinite_intensity': inf_ints,
        },
    )


def check_zero_fraction(
    sp_lens: np.ndarray,
    declared_lengths: Sequence[int],
    representation: Optional[str],
    cfg: Dict[str, Any],
) -> CheckResult:
    """Fraction of declared peaks removed at read time (zero, negative or NaN intensity)."""
    declared = int(np.sum(declared_lengths, dtype=np.int64))
    if declared == 0:
        return _result('zero_fraction', TIER_C1, evidence=Evidence.NOT_ASSESSABLE)
    fraction = 1 - int(sp_lens.sum()) / declared
    fail_above, warn_above = cfg.get('fail_above'), cfg.get('warn_above')
    is_profile = representation == 'profile'
    return _result(
        'zero_fraction',
        TIER_C1,
        value=fraction,
        threshold={'warn_above': warn_above, 'fail_above': fail_above},
        evidence=Evidence.DIRECT,
        would_block=fail_above is not None and fraction > fail_above and not is_profile,
        details={
            'declared_peaks': declared,
            'kept_peaks': int(sp_lens.sum()),
            'warn': warn_above is not None and fraction > warn_above,
            'representation': representation,
            'includes_negative_and_nan': True,
        },
    )


def check_peak_count(sp_lens: np.ndarray, cfg: Dict[str, Any]) -> CheckResult:
    pct = dict(zip((5, 25, 50, 95), np.percentile(sp_lens, [5, 25, 50, 95])))
    fail_below, warn_below = cfg.get('fail_below'), cfg.get('warn_below')
    return _result(
        'peak_count',
        TIER_C1,
        value=float(pct[50]),
        threshold={'warn_below': warn_below, 'fail_below': fail_below},
        evidence=Evidence.DIRECT,
        would_block=fail_below is not None and pct[50] < fail_below,
        details={
            'p5': float(pct[5]),
            'p25': float(pct[25]),
            'p95': float(pct[95]),
            'n_empty': int((sp_lens == 0).sum()),
            'warn': warn_below is not None and bool(pct[50] < warn_below),
        },
    )


def spectrum_tic(ints: np.ndarray, sp_lens: np.ndarray) -> np.ndarray:
    """Sum of intensities per spectrum. reduceat misbehaves on empty segments, so only the
    non-empty spectra are reduced."""
    tic = np.zeros(len(sp_lens), dtype=np.float64)
    nonempty = sp_lens > 0
    if nonempty.any():
        starts = (np.cumsum(sp_lens) - sp_lens)[nonempty]
        tic[nonempty] = np.add.reduceat(ints, starts, dtype=np.float64)
    return tic


def check_tic(tic: np.ndarray, cfg: Dict[str, Any]) -> CheckResult:
    """Spread of log-TIC over pixels above a simple TIC cutoff, and the fraction of hot pixels
    by a MAD rule. The tissue mask is a rough heuristic, hence the INFERRED label."""
    positive = tic[np.isfinite(tic) & (tic > 0)]
    if len(positive) < MIN_TIC_PIXELS:
        return _result('tic', TIER_C1, evidence=Evidence.NOT_ASSESSABLE)
    tissue = positive[positive > cfg['mask_fraction'] * np.median(positive)]
    log_tic = np.log(tissue)
    mean, std = float(log_tic.mean()), float(log_tic.std())
    median = np.median(log_tic)
    mad = 1.4826 * np.median(np.abs(log_tic - median))
    hot_fraction = float(np.mean(log_tic - median > cfg['hot_mad_k'] * mad)) if mad > 0 else 0.0
    cv_limit, hot_limit = cfg.get('cv_fail_above'), cfg.get('hot_fraction_fail_above')
    cv_value = std / abs(mean) if mean else None
    return _result(
        'tic',
        TIER_C1,
        value=cv_value,
        threshold={'cv_fail_above': cv_limit, 'hot_fraction_fail_above': hot_limit},
        evidence=Evidence.INFERRED,
        would_block=(cv_limit is not None and cv_value is not None and cv_value > cv_limit)
        or (hot_limit is not None and hot_fraction > hot_limit),
        details={
            'std_log_tic': std,
            'hot_fraction': hot_fraction,
            'n_tissue': int(len(tissue)),
            'n_spectra': int(len(tic)),
            'n_non_finite': int((~np.isfinite(tic)).sum()),
        },
    )


class Bins(NamedTuple):
    edges: np.ndarray
    bounds: np.ndarray
    bin_ppm: float


def build_bins(mzs: np.ndarray, bin_ppm: float, max_bins: int) -> Optional[Bins]:
    """Geometric m/z bins of ``bin_ppm`` width over the sorted array. ``bounds[k]`` is the index of
    the first peak in bin k, so the peaks of bin k are ``mzs[bounds[k]:bounds[k + 1]]``."""
    first = int(np.searchsorted(mzs, 0, side='right'))
    last = int(np.searchsorted(mzs, np.inf, side='left'))
    if last - first < 2 or mzs[last - 1] <= mzs[first]:
        return None
    low_mz, high_mz = float(mzs[first]), float(mzs[last - 1])
    ratio = 1 + bin_ppm * 1e-6
    n_bins = int(np.ceil(np.log(high_mz / low_mz) / np.log(ratio))) + 1
    if n_bins > max_bins:
        n_bins = max_bins
        ratio = (high_mz / low_mz) ** (1 / (n_bins - 1))
    edges = low_mz * ratio ** np.arange(n_bins + 1)
    bounds = np.searchsorted(mzs, edges.astype(mzs.dtype), side='left')
    return Bins(edges, bounds, float((ratio - 1) * 1e6))


def check_low_occupancy(bins: Optional[Bins], cfg: Dict[str, Any]) -> CheckResult:
    """Share of peaks in bins that hold fewer than ``min_pixels`` peaks. Peaks per bin stand in
    for pixels per bin, so this is an inference, not a measurement."""
    if bins is None:
        return _result('low_occupancy', TIER_C2, evidence=Evidence.NOT_ASSESSABLE)
    counts = np.diff(bins.bounds)
    total = int(counts.sum())
    low = (counts > 0) & (counts < cfg['min_pixels'])
    limit = cfg.get('fail_above')
    fraction = float(counts[low].sum() / total) if total else 0.0
    return _result(
        'low_occupancy',
        TIER_C2,
        value=fraction,
        threshold=limit,
        evidence=Evidence.INFERRED,
        would_block=limit is not None and fraction > limit,
        details={
            'bin_ppm': bins.bin_ppm,
            'n_bins': int(len(counts)),
            'n_occupied_bins': int((counts > 0).sum()),
            'n_low_bins': int(low.sum()),
            'median_peaks_per_occupied_bin': float(np.median(counts[counts > 0])) if total else 0,
            'min_pixels': cfg['min_pixels'],
        },
    )


class Neighbourhood(NamedTuple):
    width: int
    height: int
    degree: np.ndarray
    n_pixels: int
    n_pairs: int


def build_neighbourhood(mask: np.ndarray) -> Neighbourhood:
    """Number of acquired 8-neighbours of every acquired pixel, indexed by Y * W + X."""
    height, width = mask.shape
    degree = np.zeros((height, width), dtype=np.int32)
    for d_row, d_col in NEIGHBOUR_OFFSETS:
        src = (
            slice(max(d_row, 0), height + min(d_row, 0)),
            slice(max(d_col, 0), width + min(d_col, 0)),
        )
        dst = (
            slice(max(-d_row, 0), height + min(-d_row, 0)),
            slice(max(-d_col, 0), width + min(-d_col, 0)),
        )
        degree[dst] += mask[src]
    degree *= mask
    return Neighbourhood(width, height, degree.ravel(), int(mask.sum()), int(degree.sum()))


def morans_i(pixels: np.ndarray, values: np.ndarray, hood: Neighbourhood) -> Optional[float]:
    """Moran's I of an ion image over the acquired pixels (8-neighbourhood). Only the pixels
    that hold a peak are touched: the sums over zeros are folded into the mean terms."""
    uniq, inverse = np.unique(pixels.astype(np.int64), return_inverse=True)
    x = np.bincount(inverse, weights=values.astype(np.float64))
    row, col = uniq // hood.width, uniq % hood.width
    cross = 0.0
    for d_row, d_col in NEIGHBOUR_OFFSETS:
        inside = (
            (row + d_row >= 0)
            & (row + d_row < hood.height)
            & (col + d_col >= 0)
            & (col + d_col < hood.width)
        )
        neighbour = uniq[inside] + d_row * hood.width + d_col
        pos = np.minimum(np.searchsorted(uniq, neighbour), len(uniq) - 1)
        hit = uniq[pos] == neighbour
        cross += float(np.sum(x[inside][hit] * x[pos[hit]]))
    mean = x.sum() / hood.n_pixels
    denominator = float(np.sum(x ** 2) - hood.n_pixels * mean ** 2)
    if denominator <= 1e-12 or hood.n_pairs == 0:
        return None
    numerator = cross - 2 * mean * float(np.sum(x * hood.degree[uniq])) + mean ** 2 * hood.n_pairs
    return float(hood.n_pixels / hood.n_pairs * numerator / denominator)


def _sample_bins(bins: Bins, n_draws: int, seed: int) -> np.ndarray:
    """Bins of uniformly drawn peaks, so bins are visited in proportion to their peak share."""
    rng = np.random.RandomState(seed)
    draws = rng.randint(bins.bounds[0], bins.bounds[-1], size=n_draws)
    ids = np.searchsorted(bins.bounds, draws, side='right') - 1
    _, first = np.unique(ids, return_index=True)
    return ids[np.sort(first)]


def check_spatial_coherence(  # pylint: disable=too-many-arguments,too-many-locals
    arrays: Dict[str, np.ndarray],
    bins: Optional[Bins],
    mask: np.ndarray,
    cfg: Dict[str, Any],
    seed: int = 0,
) -> CheckResult:
    """Moran's I on about ``n_bins`` m/z bins drawn in proportion to their peak counts. Bins with
    too few pixels are skipped: they are counted by the low-occupancy check instead."""
    if bins is None or mask.size > cfg['max_dense_cells'] or mask.sum() < 2:
        return _result('spatial_coherence', TIER_C2, evidence=Evidence.NOT_ASSESSABLE)
    hood = build_neighbourhood(mask)
    counts = np.diff(bins.bounds)
    scores, skipped = [], 0
    for bin_id in _sample_bins(bins, cfg['n_bins'] * 20, seed):
        if len(scores) >= cfg['n_bins']:
            break
        if counts[bin_id] < cfg['min_pixels']:
            skipped += 1
            continue
        start, end = bins.bounds[bin_id], bins.bounds[bin_id + 1]
        score = morans_i(arrays['sp_idxs'][start:end], arrays['ints'][start:end], hood)
        if score is not None:
            scores.append(score)
    if not scores:
        return _result(
            'spatial_coherence',
            TIER_C2,
            evidence=Evidence.NOT_ASSESSABLE,
            details={'skipped': skipped},
        )
    incoherent = float(np.mean(np.array(scores) <= cfg['moran_min']))
    limit = cfg.get('fail_above')
    return _result(
        'spatial_coherence',
        TIER_C2,
        value=incoherent,
        threshold=limit,
        evidence=Evidence.INFERRED,
        would_block=limit is not None and incoherent > limit,
        details={
            'n_assessed': len(scores),
            'n_skipped_low_occupancy': skipped,
            'median_morans_i': float(np.median(scores)),
            'moran_min': cfg['moran_min'],
        },
    )


def check_noise_combined(
    low_occupancy: CheckResult, coherence: CheckResult, cfg: Dict[str, Any]
) -> CheckResult:
    """Share of peaks that sit in low-occupancy bins or in sampled bins without spatial
    structure. The coherence share is taken among the bins that could be assessed."""
    low = low_occupancy.value
    if low is None:
        return _result('noise_combined', TIER_C2, evidence=Evidence.NOT_ASSESSABLE)
    incoherent = coherence.value if coherence.value is not None else 0.0
    combined = float(low + (1 - low) * incoherent)
    limit = cfg.get('fail_above')
    return _result(
        'noise_combined',
        TIER_C2,
        value=combined,
        threshold=limit,
        evidence=Evidence.INFERRED,
        would_block=limit is not None and combined > limit,
        details={
            'low_occupancy_fraction': low,
            'incoherent_fraction': coherence.value,
        },
    )
