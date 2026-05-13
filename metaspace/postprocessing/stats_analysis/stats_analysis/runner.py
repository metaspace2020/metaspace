"""Orchestrate a real stats run from an engine-prepared payload.

Inputs:
  payload['prep']         -> { samples, intensities, ions_total, filterChain }
                              samples are PER-REGION rows carrying regionKey,
                              sampleId, datasetId, labelGroupName, condition,
                              biologicalReplicateId, technicalReplicateId,
                              batchId, tic.
                              intensities is keyed by regionKey, not sampleId.
  payload['label_groups'] -> [{ name, color }, ...] from the experiment row.
  payload['filters']      -> { fdr, moldb_ids, adducts, min_detection }.
  payload['datasets']     -> region metadata (used by `inferred_test` to
                              pick a test from the design matrix).

Output: { inferred_test, results, run_qc } per the engine callback contract.

Test inference (subset of design1.csv):
  - 2 conditions, paired by biologicalReplicateId across conditions
                             -> WILCOXON_PAIRED
  - 2 conditions, unpaired   -> WILCOXON_UNPAIRED  (Wilcoxon rank-sum)
  - 3+ conditions            -> KRUSKAL_WALLIS
  - degenerate (n<2 in any arm) -> NOT_ENOUGH_DATA, p/fdr emitted as NULL.

A/B derivation (option 2, per design2.csv): for each label group, collect
its regions (where `region.labelGroupName == lg.name`) and split by
`region.metadata.condition`.
"""
from __future__ import annotations

import math
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import stats as _scistats

from .stats import (
    benjamini_hochberg,
    compute_sample_qc,
    friedman_test,
    pca_2d,
    welch_ttest,
    wilcoxon_paired,
)


def _ion_table(intensities: Dict[str, Dict[int, float]]) -> List[int]:
    ids: set = set()
    for m in intensities.values():
        ids.update(m.keys())
    return sorted(ids)


def _matrix(
    intensities: Dict[str, Dict[int, float]], regions: List[str], ions: List[int]
) -> np.ndarray:
    m = np.zeros((len(regions), len(ions)), dtype=np.float64)
    for i, r in enumerate(regions):
        ion_map = intensities.get(r) or {}
        for j, ion_id in enumerate(ions):
            m[i, j] = ion_map.get(ion_id, 0.0)
    return m


def _regions_per_label_group(
    samples_meta: List[Dict], label_group_name: str
) -> List[Dict]:
    return [s for s in samples_meta if s.get('labelGroupName') == label_group_name]


def _split_by_condition(regions: List[Dict]) -> "OrderedDict[str, List[Dict]]":
    """Group regions by metadata.condition, preserving first-seen order."""
    groups: "OrderedDict[str, List[Dict]]" = OrderedDict()
    for r in regions:
        cond = r.get('condition') or ''
        groups.setdefault(cond, []).append(r)
    return groups


def _bio_rep_sets(
    groups: "OrderedDict[str, List[Dict]]",
) -> List[set]:
    return [
        {r.get('biologicalReplicateId') for r in cs if r.get('biologicalReplicateId')}
        for cs in groups.values()
    ]


def _infer_test(
    groups: "OrderedDict[str, List[Dict]]",
    raw_regions: Optional[List[Dict]] = None,
) -> Tuple[str, List[str]]:
    """Pick a test from the design1.csv matrix. Returns (test_name, warnings)."""
    cond_ids = list(groups.keys())
    warnings: List[str] = []
    if len(cond_ids) == 0 or any(len(rs) < 1 for rs in groups.values()):
        return 'NOT_ENOUGH_DATA', warnings
    if len(cond_ids) < 2:
        return 'NOT_ENOUGH_DATA', warnings

    # Tech-rep partial detection on RAW regions (pre-aggregation).
    if raw_regions is not None:
        tech_flags = [bool(r.get('technicalReplicateId')) for r in raw_regions]
        if any(tech_flags) and not all(tech_flags):
            warnings.append('TECH_REPS_PARTIAL')

    sizes = [len(cs) for cs in groups.values()]
    if len(set(sizes)) > 1:
        warnings.append('UNBALANCED_N')

    bio_sets = _bio_rep_sets(groups)
    common = set.intersection(*bio_sets) if all(bio_sets) else set()
    fully_paired = bool(common) and all(s == common for s in bio_sets)
    partially_paired = bool(common) and not fully_paired

    if len(cond_ids) >= 3:
        if fully_paired:
            return 'FRIEDMAN', warnings
        return 'KRUSKAL_WALLIS', warnings
    if fully_paired:
        return 'WILCOXON_PAIRED', warnings
    if partially_paired:
        warnings.append('PARTIAL_PAIRING')
        return 'WILCOXON_PAIRED_PARTIAL', warnings
    return 'WILCOXON_UNPAIRED', warnings


def _run_pair_test(
    test_kind: str, a_vals: np.ndarray, b_vals: np.ndarray
) -> Tuple[float, float]:
    """Return (statistic, p_value). NaN/NaN if degenerate."""
    if a_vals.size < 2 or b_vals.size < 2:
        return math.nan, math.nan
    if a_vals.size == 0 or b_vals.size == 0:
        return math.nan, math.nan
    try:
        if test_kind == 'WILCOXON_PAIRED':
            if a_vals.size != b_vals.size:
                return math.nan, math.nan
            diffs = b_vals - a_vals
            if np.all(diffs == 0):
                return math.nan, math.nan
            stat, p = _scistats.wilcoxon(a_vals, b_vals, zero_method='wilcox')
            return float(stat), float(p)
        if test_kind == 'WILCOXON_UNPAIRED':
            if np.var(a_vals) == 0 and np.var(b_vals) == 0:
                return math.nan, math.nan
            stat, p = _scistats.ranksums(a_vals, b_vals)
            return float(stat), float(p)
        # Fallback: Welch (kept so callers can still request a parametric test).
        return welch_ttest(a_vals, b_vals)
    except (ValueError, ZeroDivisionError):
        return math.nan, math.nan


def _run_kruskal(group_arrays: List[np.ndarray]) -> Tuple[float, float]:
    if any(g.size < 1 for g in group_arrays) or len(group_arrays) < 2:
        return math.nan, math.nan
    if all(np.var(g) == 0 for g in group_arrays):
        return math.nan, math.nan
    try:
        stat, p = _scistats.kruskal(*group_arrays)
        return float(stat), float(p)
    except (ValueError, ZeroDivisionError):
        return math.nan, math.nan


def _aggregate_regions_by_key(
    regions: List[Dict],
    intensities: Dict[str, Dict[int, float]],
    key_fn,
    synth_prefix: str,
) -> Tuple[List[Dict], Dict[str, Dict[int, float]]]:
    """Average regions sharing the same `key_fn` value into single synthetic regions.

    Args:
        regions: list of region metadata dicts.
        intensities: regionKey -> {ion_id: intensity}. NOT mutated.
        key_fn: callable(region_meta) -> hashable key, or None to skip aggregation
            for that region.
        synth_prefix: prefix for synthesized regionKey.

    Returns:
        (new_regions, new_intensities) where new_intensities is a fresh dict
        containing only the (possibly synthesized) region keys; original
        regions whose key_fn returns None pass through unchanged.
    """
    buckets: "OrderedDict[Any, List[Dict]]" = OrderedDict()
    pass_through: List[Dict] = []
    for r in regions:
        k = key_fn(r)
        if k is None:
            pass_through.append(r)
        else:
            buckets.setdefault(k, []).append(r)

    new_regions: List[Dict] = list(pass_through)
    new_intensities: Dict[str, Dict[int, float]] = {}
    for r in pass_through:
        rk = r.get('regionKey')
        if rk in intensities:
            new_intensities[rk] = dict(intensities[rk])

    for idx, (_, group) in enumerate(buckets.items()):
        if len(group) == 1:
            r = group[0]
            new_regions.append(r)
            rk = r.get('regionKey')
            if rk in intensities:
                new_intensities[rk] = dict(intensities[rk])
            continue
        # Average per-ion intensity across the bucket.
        all_ions: set = set()
        for r in group:
            all_ions.update((intensities.get(r.get('regionKey')) or {}).keys())
        averaged: Dict[int, float] = {}
        for ion_id in all_ions:
            vals = [
                float((intensities.get(r.get('regionKey')) or {}).get(ion_id, 0.0))
                for r in group
            ]
            averaged[ion_id] = sum(vals) / len(vals)
        synth_key = f'{synth_prefix}::{idx}'
        synth_meta = dict(group[0])
        synth_meta['regionKey'] = synth_key
        synth_meta['_aggregatedFrom'] = [r.get('regionKey') for r in group]
        new_regions.append(synth_meta)
        new_intensities[synth_key] = averaged
    return new_regions, new_intensities


def _multi_region_aggregate(
    regions: List[Dict],
    intensities: Dict[str, Dict[int, float]],
) -> Tuple[List[Dict], Dict[str, Dict[int, float]], bool]:
    """Collapse regions sharing (biologicalReplicateId, condition) into one.

    Used for scenarios 7/8 (multi-region or cross-dataset), where one
    biological replicate contributes multiple regions to the same condition.

    Returns:
        (new_regions, new_intensities, did_collapse).
    """
    def key(r: Dict):
        bio = r.get('biologicalReplicateId')
        cond = r.get('condition')
        if not bio:
            return None
        return (bio, cond)

    # Detect whether any bucket has > 1 region — only aggregate then.
    buckets: Dict[Any, int] = {}
    for r in regions:
        k = key(r)
        if k is None:
            continue
        buckets[k] = buckets.get(k, 0) + 1
    if not any(c > 1 for c in buckets.values()):
        return regions, intensities, False
    new_r, new_i = _aggregate_regions_by_key(regions, intensities, key, 'agg-bio')
    return new_r, new_i, True


def _tech_rep_aggregate(
    regions: List[Dict],
    intensities: Dict[str, Dict[int, float]],
) -> Tuple[List[Dict], Dict[str, Dict[int, float]], bool]:
    """Collapse regions sharing (sampleId, technicalReplicateId) into one.

    Returns:
        (new_regions, new_intensities, did_collapse).
    """
    def key(r: Dict):
        tech = r.get('technicalReplicateId')
        if not tech:
            return None
        return (r.get('sampleId'), tech)

    buckets: Dict[Any, int] = {}
    for r in regions:
        k = key(r)
        if k is None:
            continue
        buckets[k] = buckets.get(k, 0) + 1
    if not any(c > 1 for c in buckets.values()):
        return regions, intensities, False
    new_r, new_i = _aggregate_regions_by_key(regions, intensities, key, 'agg-tech')
    return new_r, new_i, True


def _per_label_group_results(
    label_group_name: str,
    test_kind: str,
    groups: "OrderedDict[str, List[Dict]]",
    intensities: Dict[str, Dict[int, float]],
    surviving_ids: List[int],
) -> List[Dict[str, Any]]:
    """Produce result rows for one label group.

    For 2-condition tests the group order from ``groups`` is taken as
    (A, B). For 3+ conditions we still emit n_a/n_b populated from the
    first two groups for backwards-compat with the result-row schema; LFC
    becomes log2(B/A) of the first two conditions.
    """
    cond_ids = list(groups.keys())

    # For paired tests, restrict each arm to regions whose biologicalReplicateId
    # appears in the common-bio set, then sort by bio_rep_id for alignment.
    common_bios: set = set()
    if test_kind in ('WILCOXON_PAIRED', 'WILCOXON_PAIRED_PARTIAL', 'FRIEDMAN'):
        bio_sets = _bio_rep_sets(groups)
        if all(bio_sets):
            common_bios = set.intersection(*bio_sets)

    def _select_regions(cond: str) -> List[str]:
        regs = groups[cond]
        if test_kind in ('WILCOXON_PAIRED', 'WILCOXON_PAIRED_PARTIAL', 'FRIEDMAN') and common_bios:
            regs = [r for r in regs if r.get('biologicalReplicateId') in common_bios]
            regs = sorted(regs, key=lambda r: r.get('biologicalReplicateId') or '')
        return [r['regionKey'] for r in regs]

    a_regions = _select_regions(cond_ids[0]) if cond_ids else []
    b_regions = _select_regions(cond_ids[1]) if len(cond_ids) >= 2 else []
    extra_arrays_per_ion = [_select_regions(cond) for cond in cond_ids[2:]]

    per_ion_p: List[float] = []
    per_ion_rows: List[Dict[str, Any]] = []
    for ion_id in surviving_ids:
        a_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in a_regions])
        b_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in b_regions])

        mean_a = float(a_vals.mean()) if a_vals.size else 0.0
        mean_b = float(b_vals.mean()) if b_vals.size else 0.0
        lfc = math.log2((mean_b + 1.0) / (mean_a + 1.0))

        if test_kind == 'KRUSKAL_WALLIS':
            extras = [
                np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in regs])
                for regs in extra_arrays_per_ion
            ]
            _, p = _run_kruskal([a_vals, b_vals, *extras])
        elif test_kind == 'FRIEDMAN':
            extras = [
                np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in regs])
                for regs in extra_arrays_per_ion
            ]
            _, p = friedman_test([a_vals, b_vals, *extras])
        elif test_kind == 'WILCOXON_PAIRED_PARTIAL':
            _, p = wilcoxon_paired(a_vals, b_vals)
        elif test_kind == 'NOT_ENOUGH_DATA':
            p = math.nan
        else:
            _, p = _run_pair_test(test_kind, a_vals, b_vals)

        per_ion_p.append(p)
        per_ion_rows.append({
            'ion_id': ion_id,
            'label_group_name': label_group_name,
            'lfc': lfc,
            'p_value': None if math.isnan(p) else p,
            'detection_rate_a': float((a_vals > 0).mean()) if a_vals.size else 0.0,
            'detection_rate_b': float((b_vals > 0).mean()) if b_vals.size else 0.0,
            'n_a': len(a_regions),
            'n_b': len(b_regions),
        })

    fdrs = benjamini_hochberg(per_ion_p)
    for row, q in zip(per_ion_rows, fdrs):
        row['fdr'] = None if (isinstance(q, float) and math.isnan(q)) else q
    return per_ion_rows


def _summarise_inferred_test(per_lg: List[str]) -> str:
    """Combine per-label-group test names into a single experiment-level label."""
    seen = [t for t in per_lg if t]
    if not seen:
        return 'NOT_ENOUGH_DATA'
    unique = sorted(set(seen))
    if len(unique) == 1:
        return unique[0]
    # Mix of tests across label groups (e.g. some paired, some not).
    return 'MIXED:' + ','.join(unique)


def run_experiment(experiment_id: str, run_generation: int, payload: Dict) -> Dict[str, Any]:
    """Execute the real stats pipeline against an engine-built prep block."""
    prep = payload.get('prep') or {}
    intensities: Dict[str, Dict[int, float]] = prep.get('intensities') or {}
    samples_meta: List[Dict] = prep.get('samples') or []
    label_groups: List[Dict] = payload.get('label_groups') or []
    filters: Dict = payload.get('filters') or {}

    region_keys = [s.get('regionKey') or s.get('sampleId') for s in samples_meta]
    ions = _ion_table(intensities)

    # PREP filtered by fdr/moldb/adduct and recorded counts; append +detection here.
    chain = list(prep.get('filterChain') or [
        {'name': 'All annotated ions', 'count': len(ions), 'droppedFromPrev': 0},
    ])
    min_detect = filters.get('min_detection')
    if min_detect is not None and region_keys:
        before = len(ions)
        surviving_ids = [
            ion_id for ion_id in ions
            if (sum(1 for rk in region_keys if intensities.get(rk, {}).get(ion_id, 0.0) > 0)
                / max(1, len(region_keys))) >= min_detect
        ]
        chain.append({
            'name': f'+detection >= {min_detect}',
            'count': len(surviving_ids),
            'droppedFromPrev': before - len(surviving_ids),
        })
    else:
        surviving_ids = ions

    matrix = _matrix(intensities, region_keys, surviving_ids)

    qc_basic = compute_sample_qc(intensities, prep.get('ions_total', len(ions)))
    pca_coords, pca_var = pca_2d(matrix)

    samples_out = []
    for idx, s in enumerate(samples_meta):
        rk = s.get('regionKey') or s.get('sampleId')
        samples_out.append({
            'regionKey': rk,
            'sampleId': s.get('sampleId'),
            'datasetId': s.get('datasetId'),
            'labelGroupName': s.get('labelGroupName'),
            'condition': s.get('condition') or '',
            'biologicalReplicateId': s.get('biologicalReplicateId'),
            'tic': float(s.get('tic', 0.0)),
            'detectionRate': qc_basic.get(rk, {}).get('detectionRate', 0.0),
            'cv': qc_basic.get(rk, {}).get('cv', 0.0),
            'pcaPC1': float(pca_coords[idx, 0]) if matrix.size else 0.0,
            'pcaPC2': float(pca_coords[idx, 1]) if matrix.size else 0.0,
        })

    coverage = {
        rk: {
            'detected': int(sum(1 for v in (intensities.get(rk) or {}).values() if v > 0.0)),
            'total': len(surviving_ids),
        }
        for rk in region_keys
    }

    intensity_rows: List[Dict[str, Any]] = []
    for ion_id in surviving_ids:
        for rk in region_keys:
            val = float(intensities.get(rk, {}).get(ion_id, 0.0))
            if val == 0.0:
                continue
            intensity_rows.append({
                'ion_id': ion_id,
                'region_key': rk,
                'intensity': val,
            })

    results: List[Dict] = []
    per_lg_tests: List[str] = []
    warnings_per_lg: Dict[str, List[str]] = {}
    flat_warnings: List[str] = []
    for lg in label_groups:
        lg_name = lg['name']
        lg_regions = _regions_per_label_group(samples_meta, lg_name)
        if not lg_regions:
            per_lg_tests.append('NOT_ENOUGH_DATA')
            warnings_per_lg[lg_name] = []
            continue

        # Order: multi-region pre-aggregation -> tech-rep averaging -> infer test.
        local_intensities: Dict[str, Dict[int, float]] = dict(intensities)
        agg_regions, local_intensities, did_multi = _multi_region_aggregate(
            lg_regions, local_intensities,
        )
        agg_regions, local_intensities, _ = _tech_rep_aggregate(
            agg_regions, local_intensities,
        )

        groups = _split_by_condition(agg_regions)
        test_kind, lg_warnings = _infer_test(groups, raw_regions=lg_regions)
        if did_multi:
            lg_warnings.append('MULTI_REGION_AGGREGATED')
        per_lg_tests.append(test_kind)
        warnings_per_lg[lg_name] = lg_warnings
        flat_warnings.extend(lg_warnings)

        results.extend(_per_label_group_results(
            lg_name, test_kind, groups, local_intensities, surviving_ids,
        ))

    # Experiment-wide fallback: when no label group yielded a usable test (e.g.
    # the user used label groups as a replicate-cluster axis instead of a
    # within-group comparison axis), pool all LG-assigned regions and run one
    # experiment-wide test if ≥2 distinct conditions exist across the pool.
    # Mirrors design1.csv scenarios #1/#8 where the comparison happens across
    # conditions at the experiment level.
    fallback_test: Optional[str] = None
    if label_groups and all(t == 'NOT_ENOUGH_DATA' for t in per_lg_tests):
        pooled: List[Dict] = []
        for lg in label_groups:
            pooled.extend(_regions_per_label_group(samples_meta, lg['name']))
        pooled_conditions = {r.get('condition') for r in pooled if r.get('condition')}
        if len(pooled_conditions) >= 2:
            local_intensities = dict(intensities)
            agg_regions, local_intensities, did_multi = _multi_region_aggregate(
                pooled, local_intensities,
            )
            agg_regions, local_intensities, _ = _tech_rep_aggregate(
                agg_regions, local_intensities,
            )
            groups = _split_by_condition(agg_regions)
            test_kind, fb_warnings = _infer_test(groups, raw_regions=pooled)
            if did_multi:
                fb_warnings.append('MULTI_REGION_AGGREGATED')
            fb_warnings.append('EXPERIMENT_WIDE_FALLBACK')
            fallback_test = test_kind
            warnings_per_lg['__experiment__'] = fb_warnings
            flat_warnings.extend(fb_warnings)
            results = _per_label_group_results(
                '__experiment__', test_kind, groups, local_intensities, surviving_ids,
            )

    per_lg_map = dict(zip([lg['name'] for lg in label_groups], per_lg_tests))
    if fallback_test is not None:
        per_lg_map['__experiment__'] = fallback_test
    summary_tests = [fallback_test] if fallback_test is not None else per_lg_tests

    return {
        'inferred_test': _summarise_inferred_test(summary_tests),
        'results': results,
        'intensity_rows': intensity_rows,
        'run_qc': {
            'samples': samples_out,
            'pcaVariance': pca_var,
            'filterChain': chain,
            'coverage': coverage,
            'inferredTestPerLabelGroup': per_lg_map,
            'allIons': _build_all_ions(prep.get('all_ions') or [], intensities, region_keys),
            'warnings': flat_warnings,
            'warningsPerLabelGroup': warnings_per_lg,
        },
    }


def _build_all_ions(
    all_ions: List[Dict[str, Any]],
    intensities: Dict[str, Dict[int, float]],
    region_keys: List[str],
) -> List[Dict[str, Any]]:
    """Enrich the prep all_ions snapshot with a detection_rate per ion.

    detection_rate = fraction of region_keys where intensity > 0.
    """
    n_regions = max(1, len(region_keys))
    out: List[Dict[str, Any]] = []
    for entry in all_ions:
        ion_id = entry.get('ion_id')
        if ion_id is None:
            continue
        detected = sum(
            1 for rk in region_keys if (intensities.get(rk) or {}).get(ion_id, 0.0) > 0.0
        )
        out.append({
            'ion_id': ion_id,
            'fdr': entry.get('fdr'),
            'adduct': entry.get('adduct'),
            'moldb_id': entry.get('moldb_id'),
            'moldb_name': entry.get('moldb_name'),
            'detection_rate': detected / n_regions,
        })
    return out
