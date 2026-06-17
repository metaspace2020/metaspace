"""Orchestrate a real stats run from an engine-prepared payload.

Output shape: { inferred_test, results, run_qc } per the engine callback contract.
"""
# pylint: disable=invalid-name  # short loop/stats vars (r, p, q, rk, lg, md, s) are conventional
from __future__ import annotations

import gzip
import json as _json
import math
import os
from collections import OrderedDict
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from .limma_python import run_limma as _run_limma
from .stats import (
    benjamini_hochberg,
    compute_sample_qc,
    pca_2d,
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


def _regions_per_label_group(samples_meta: List[Dict], label_group_name: str) -> List[Dict]:
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


def _infer_test(  # pylint: disable=too-many-return-statements
    groups: "OrderedDict[str, List[Dict]]",
    raw_regions: Optional[List[Dict]] = None,
) -> Tuple[str, List[str]]:
    """Pick a test from the design matrix. Returns (test_name, warnings)."""
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

    if partially_paired:
        warnings.append('PARTIAL_PAIRING')
    return 'LIMMA', warnings


def _aggregate_regions_by_key(
    regions: List[Dict],
    intensities: Dict[str, Dict[int, float]],
    key_fn,
    synth_prefix: str,
) -> Tuple[List[Dict], Dict[str, Dict[int, float]]]:
    """Average regions sharing the same key_fn value into synthetic regions.

    Regions where key_fn returns None pass through unchanged.
    Returns (new_regions, new_intensities).
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
        all_ions: set = set()
        for r in group:
            all_ions.update((intensities.get(r.get('regionKey')) or {}).keys())
        averaged: Dict[int, float] = {}
        for ion_id in all_ions:
            vals = [
                float((intensities.get(r.get('regionKey')) or {}).get(ion_id, 0.0)) for r in group
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

    Returns (new_regions, new_intensities, did_collapse).
    """

    def key(r: Dict):
        bio = r.get('biologicalReplicateId')
        cond = r.get('condition')
        if not bio:
            return None
        return (bio, cond)

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

    Returns (new_regions, new_intensities, did_collapse).
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


def _pair_row(
    ion_id: int,
    label_group_name: str,
    cond_a: str,
    cond_b: str,
    a_vals: np.ndarray,
    b_vals: np.ndarray,
    n_a: int,
    n_b: int,
    p_value: float,
) -> Dict[str, Any]:
    """Build a per-contrast result row for one ion."""
    mean_a = float(a_vals.mean()) if a_vals.size else 0.0
    mean_b = float(b_vals.mean()) if b_vals.size else 0.0
    return {
        'ion_id': ion_id,
        'label_group_name': label_group_name,
        'cond_a': cond_a,
        'cond_b': cond_b,
        'lfc': math.log2((mean_b + 1.0) / (mean_a + 1.0)),
        'p_value': None if math.isnan(p_value) else float(p_value),
        'fdr': None,
        'n_a': n_a,
        'n_b': n_b,
        'mean_a': mean_a,
        'mean_b': mean_b,
        'detection_rate_a': float((a_vals > 0).mean()) if a_vals.size else 0.0,
        'detection_rate_b': float((b_vals > 0).mean()) if b_vals.size else 0.0,
    }


def _omnibus_row(
    ion_id: int,
    label_group_name: str,
    p_value: float,
) -> Dict[str, Any]:
    """Build an omnibus (no-contrast) result row for one ion."""
    return {
        'ion_id': ion_id,
        'label_group_name': label_group_name,
        'cond_a': None,
        'cond_b': None,
        'lfc': None,
        'p_value': None if math.isnan(p_value) else float(p_value),
        'fdr': None,
        'n_a': None,
        'n_b': None,
        'mean_a': None,
        'mean_b': None,
        'detection_rate_a': None,
        'detection_rate_b': None,
    }


def _per_label_group_results(  # pylint: disable=unused-argument
    label_group_name: str,
    test_kind: str,
    groups: "OrderedDict[str, List[Dict]]",
    intensities: Dict[str, Dict[int, float]],
    surviving_ids: List[int],
) -> List[Dict[str, Any]]:
    """Emit null pair rows for NOT_ENOUGH_DATA designs."""
    cond_ids = list(groups.keys())
    if len(cond_ids) < 2:
        return []

    ca, cb = cond_ids[0], cond_ids[1]
    ca, cb = (ca, cb) if ca < cb else (cb, ca)
    keys_a = [r['regionKey'] for r in groups[ca]]
    keys_b = [r['regionKey'] for r in groups[cb]]

    pair_rows: List[Dict[str, Any]] = []
    for ion_id in surviving_ids:
        a_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_a])
        b_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_b])
        pair_rows.append(
            _pair_row(
                ion_id, label_group_name, ca, cb, a_vals, b_vals, a_vals.size, b_vals.size, math.nan
            )
        )

    ps = [r['p_value'] if r['p_value'] is not None else math.nan for r in pair_rows]
    qs = benjamini_hochberg(ps)
    for r, q in zip(pair_rows, qs):
        r['fdr'] = None if (isinstance(q, float) and math.isnan(q)) else q

    return pair_rows


def _build_limma_inputs(  # pylint: disable=too-many-locals
    groups: "OrderedDict[str, List[Dict]]",
    intensities: Dict[str, Dict[int, float]],
    surviving_ids: List[int],
) -> Tuple[np.ndarray, np.ndarray, List, np.ndarray, List[Tuple[str, str]]]:
    """Build (Y, X, block_ids, contrasts, pair_labels) for run_limma."""
    cond_order = list(groups.keys())
    K = len(cond_order)
    all_regions = [(cond, r) for cond in cond_order for r in groups[cond]]
    n_samples = len(all_regions)
    n_features = len(surviving_ids)

    Y = np.zeros((n_features, n_samples), dtype=np.float64)
    for j, (_, r) in enumerate(all_regions):
        ion_map = intensities.get(r['regionKey']) or {}
        for i, ion_id in enumerate(surviving_ids):
            Y[i, j] = math.log2(ion_map.get(ion_id, 0.0) + 1.0)

    X = np.zeros((n_samples, K), dtype=np.float64)
    X[:, 0] = 1.0
    sample_idx = 0
    for ci, cond in enumerate(cond_order):
        for _ in groups[cond]:
            if ci > 0:
                X[sample_idx, ci] = 1.0
            sample_idx += 1

    block_ids = []
    for _, r in all_regions:
        bio = r.get('biologicalReplicateId')
        block_ids.append(bio if bio else r['regionKey'])

    pair_labels: List[Tuple[str, str]] = []
    contrast_rows: List[np.ndarray] = []
    for i in range(K):
        for j_idx in range(i + 1, K):
            cond_i, cond_j = cond_order[i], cond_order[j_idx]
            if cond_i < cond_j:
                cond_a, cond_b, ci_a, ci_b = cond_i, cond_j, i, j_idx
            else:
                cond_a, cond_b, ci_a, ci_b = cond_j, cond_i, j_idx, i
            c = np.zeros(K, dtype=np.float64)
            if ci_a > 0:
                c[ci_a] = -1.0
            if ci_b > 0:
                c[ci_b] = 1.0
            contrast_rows.append(c)
            pair_labels.append((cond_a, cond_b))

    contrasts = np.array(contrast_rows, dtype=np.float64) if contrast_rows else np.zeros((1, K))
    return Y, X, block_ids, contrasts, pair_labels


def _null_pair_rows(
    label_group_name: str,
    cond_order: List[str],
    groups: "OrderedDict[str, List[Dict]]",
    intensities: Dict[str, Dict[int, float]],
    surviving_ids: List[int],
) -> List[Dict[str, Any]]:
    """Null result rows used when limma fails — mirrors the limma output shape.

    K=2: one null pair row per ion.
    K≥3: one null omnibus row + K*(K-1)/2 null pair rows per ion.
    """
    K = len(cond_order)
    if K < 2:
        return []

    all_rows: List[Dict[str, Any]] = []

    if K >= 3:
        for ion_id in surviving_ids:
            all_rows.append(_omnibus_row(ion_id, label_group_name, math.nan))

    for i in range(K):
        for j in range(i + 1, K):
            ci, cj = cond_order[i], cond_order[j]
            ca, cb = (ci, cj) if ci < cj else (cj, ci)
            keys_a = [r['regionKey'] for r in groups[ca]]
            keys_b = [r['regionKey'] for r in groups[cb]]
            for ion_id in surviving_ids:
                a_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_a])
                b_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_b])
                all_rows.append(
                    _pair_row(
                        ion_id,
                        label_group_name,
                        ca,
                        cb,
                        a_vals,
                        b_vals,
                        len(keys_a),
                        len(keys_b),
                        math.nan,
                    )
                )

    return all_rows


def _per_label_group_results_limma(  # pylint: disable=too-many-locals
    label_group_name: str,
    groups: "OrderedDict[str, List[Dict]]",
    intensities: Dict[str, Dict[int, float]],
    surviving_ids: List[int],
) -> List[Dict[str, Any]]:
    """Run the limma GLS+eBayes pipeline and format results into the standard row schema.

    K=2: one pair row per ion.
    K≥3: one omnibus F row per ion, then one pair row per (ion, canonical pair).
    Falls back to null pair rows if limma fails.
    """
    cond_order = list(groups.keys())
    K = len(cond_order)

    try:
        Y, X, block_ids, contrasts, pair_labels = _build_limma_inputs(
            groups, intensities, surviving_ids
        )
        result = _run_limma(Y, X, block_ids, contrasts)
    except (ValueError, np.linalg.LinAlgError):
        return _null_pair_rows(label_group_name, cond_order, groups, intensities, surviving_ids)

    cond_rkeys = {c: [r['regionKey'] for r in regs] for c, regs in groups.items()}
    all_rows: List[Dict[str, Any]] = []

    if K >= 3:
        for fi, ion_id in enumerate(surviving_ids):
            p = float(result.f_pvalue[fi])
            q = float(result.adj_f_pvalue[fi])
            row = _omnibus_row(ion_id, label_group_name, p)
            row['fdr'] = None if math.isnan(q) else q
            all_rows.append(row)

    pair_rows_by_pair: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for pi, (cond_a, cond_b) in enumerate(pair_labels):
        keys_a = cond_rkeys[cond_a]
        keys_b = cond_rkeys[cond_b]
        rows_for_pair = []
        for fi, ion_id in enumerate(surviving_ids):
            a_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_a])
            b_vals = np.array([intensities.get(rk, {}).get(ion_id, 0.0) for rk in keys_b])
            p = float(result.pvalue[pi, fi])
            q = float(result.adj_pvalue[pi, fi])
            row = _pair_row(
                ion_id,
                label_group_name,
                cond_a,
                cond_b,
                a_vals,
                b_vals,
                len(keys_a),
                len(keys_b),
                p,
            )
            row['lfc'] = float(result.log2FC[pi, fi])
            row['fdr'] = None if math.isnan(q) else q
            rows_for_pair.append(row)
        pair_rows_by_pair[(cond_a, cond_b)] = rows_for_pair

    for rows in pair_rows_by_pair.values():
        all_rows.extend(rows)

    return all_rows


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


def run_experiment_prep(  # pylint: disable=too-many-locals,too-many-branches,too-many-statements,unused-argument
    experiment_id: str, run_generation: int, payload: Dict
) -> Dict[str, Any]:
    """Execute the real stats pipeline against an engine-built prep block."""
    prep = payload.get('prep') or {}
    intensities: Dict[str, Dict[int, float]] = prep.get('intensities') or {}
    samples_meta: List[Dict] = prep.get('samples') or []
    label_groups: List[Dict] = payload.get('label_groups') or []
    filters: Dict = payload.get('filters') or {}

    region_keys = [s.get('regionKey') or s.get('sampleId') for s in samples_meta]
    ions = _ion_table(intensities)

    chain = list(
        prep.get('filterChain')
        or [
            {'name': 'All annotated ions', 'count': len(ions), 'droppedFromPrev': 0},
        ]
    )
    min_detect = filters.get('min_detection')
    if min_detect is not None and region_keys:
        before = len(ions)
        surviving_ids = [
            ion_id
            for ion_id in ions
            if (
                sum(1 for rk in region_keys if intensities.get(rk, {}).get(ion_id, 0.0) > 0)
                / max(1, len(region_keys))
            )
            >= min_detect
        ]
        chain.append(
            {
                'name': f'+detection >= {min_detect}',
                'count': len(surviving_ids),
                'droppedFromPrev': before - len(surviving_ids),
            }
        )
    else:
        surviving_ids = ions

    matrix = _matrix(intensities, region_keys, surviving_ids)

    qc_basic = compute_sample_qc(intensities, prep.get('ions_total', len(ions)))
    pca_coords, pca_var = pca_2d(matrix)

    samples_out = []
    for idx, s in enumerate(samples_meta):
        rk = s.get('regionKey') or s.get('sampleId')
        samples_out.append(
            {
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
            }
        )

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
            intensity_rows.append(
                {
                    'ion_id': ion_id,
                    'region_key': rk,
                    'intensity': val,
                }
            )

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
            lg_regions,
            local_intensities,
        )
        agg_regions, local_intensities, _ = _tech_rep_aggregate(
            agg_regions,
            local_intensities,
        )

        groups = _split_by_condition(agg_regions)
        test_kind, lg_warnings = _infer_test(groups, raw_regions=lg_regions)
        if did_multi:
            lg_warnings.append('MULTI_REGION_AGGREGATED')
        per_lg_tests.append(test_kind)
        warnings_per_lg[lg_name] = lg_warnings
        flat_warnings.extend(lg_warnings)

        if test_kind == 'NOT_ENOUGH_DATA':
            results.extend(
                _per_label_group_results(
                    lg_name, test_kind, groups, local_intensities, surviving_ids
                )
            )
        else:
            results.extend(
                _per_label_group_results_limma(lg_name, groups, local_intensities, surviving_ids)
            )

    # Experiment-wide fallback when no label group yields a usable test.
    fallback_test: Optional[str] = None
    if label_groups and all(t == 'NOT_ENOUGH_DATA' for t in per_lg_tests):
        pooled: List[Dict] = []
        for lg in label_groups:
            pooled.extend(_regions_per_label_group(samples_meta, lg['name']))
        pooled_conditions = {r.get('condition') for r in pooled if r.get('condition')}
        if len(pooled_conditions) >= 2:
            local_intensities = dict(intensities)
            agg_regions, local_intensities, did_multi = _multi_region_aggregate(
                pooled,
                local_intensities,
            )
            agg_regions, local_intensities, _ = _tech_rep_aggregate(
                agg_regions,
                local_intensities,
            )
            groups = _split_by_condition(agg_regions)
            test_kind, fb_warnings = _infer_test(groups, raw_regions=pooled)
            if did_multi:
                fb_warnings.append('MULTI_REGION_AGGREGATED')
            fb_warnings.append('EXPERIMENT_WIDE_FALLBACK')
            fallback_test = test_kind
            warnings_per_lg['__experiment__'] = fb_warnings
            flat_warnings.extend(fb_warnings)
            if test_kind == 'NOT_ENOUGH_DATA':
                results = _per_label_group_results(
                    '__experiment__', test_kind, groups, local_intensities, surviving_ids
                )
            else:
                results = _per_label_group_results_limma(
                    '__experiment__', groups, local_intensities, surviving_ids
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


def _load_postprocessing_config() -> Dict[str, Any]:
    """Read the shared postprocessing config (mirrors image_segmentation.loader)."""
    # pylint: disable=import-outside-toplevel,import-error
    from postprocessing_shared import load_config

    default_path = Path(__file__).resolve().parents[2] / 'conf' / 'config.json'
    path = os.environ.get('POSTPROCESSING_CONFIG') or default_path
    return load_config(path)


def _build_s3_client(cfg: Dict[str, Any]):
    """Build an S3 client from the postprocessing config."""
    import boto3  # pylint: disable=import-outside-toplevel

    boto_config = boto3.session.Config(signature_version='s3v4')
    if 'aws' in cfg:
        aws = cfg['aws']
        return boto3.client(
            's3',
            region_name=aws['aws_default_region'],
            aws_access_key_id=aws['aws_access_key_id'],
            aws_secret_access_key=aws['aws_secret_access_key'],
            config=boto_config,
        )
    storage = cfg['storage']
    return boto3.client(
        's3',
        endpoint_url=storage['endpoint_url'],
        aws_access_key_id=storage['access_key_id'],
        aws_secret_access_key=storage['secret_access_key'],
        config=boto_config,
    )


def _fetch_intensity_blob(s3_key: str) -> List[Dict[str, Any]]:
    """Read the gzipped intensity blob from S3 and return the row list."""
    cfg = _load_postprocessing_config()
    try:
        bucket = cfg['image_storage']['bucket']
    except KeyError as e:
        raise RuntimeError(
            'image_storage.bucket missing from postprocessing config; '
            'add it to conf/config.json (and the ansible template)'
        ) from e
    client = _build_s3_client(cfg)
    obj = client.get_object(Bucket=bucket, Key=s3_key)
    raw = gzip.GzipFile(fileobj=BytesIO(obj['Body'].read())).read()
    return _json.loads(raw.decode('utf-8'))


def _reconstruct_prep_from_blob(
    blob_rows: List[Dict[str, Any]],
    datasets: List[Dict[str, Any]],
    excluded_samples: List[str],
) -> Dict[str, Any]:
    """Rebuild the minimum 'prep' block run_experiment_prep expects.

    Drops rows whose region's sampleId is in excluded_samples.
    """
    excluded = set(excluded_samples or [])
    samples: List[Dict[str, Any]] = []
    keep_region_keys: set = set()
    for ds in datasets:
        for region in ds.get('regions') or []:
            md = region.get('metadata') or {}
            if md.get('sampleId') in excluded:
                continue
            region_key = region.get('regionKey')
            keep_region_keys.add(region_key)
            samples.append(
                {
                    'regionKey': region_key,
                    'sampleId': md.get('sampleId'),
                    'datasetId': ds.get('dataset_id'),
                    'labelGroupName': region.get('labelGroupName'),
                    'condition': md.get('condition') or '',
                    'biologicalReplicateId': md.get('biologicalReplicateId'),
                    'technicalReplicateId': md.get('technicalReplicateId'),
                    'batchId': md.get('batchId'),
                    'tic': 0.0,
                }
            )

    intensities: Dict[str, Dict[int, float]] = {}
    for row in blob_rows:
        rk = row.get('region_key')
        if rk not in keep_region_keys:
            continue
        intensities.setdefault(rk, {})[int(row['ion_id'])] = float(row['intensity'])

    # Recompute TIC per region from the blob — it is the sum of the per-ion
    # mean intensities, matching the full PREP step (experiment_prep.py). Without
    # this the stats-only re-run would persist tic=0.0 and blank the TIC chart.
    for sample in samples:
        sample['tic'] = float(sum((intensities.get(sample['regionKey']) or {}).values()))

    ions_total = len({int(r['ion_id']) for r in blob_rows})
    return {
        'samples': samples,
        'intensities': intensities,
        'ions_total': ions_total,
        'filterChain': [],
        'all_ions': [],
    }


def run_experiment_stats(
    experiment_id: str,
    run_generation: int,
    payload: Dict,
) -> Dict[str, Any]:
    """Fetch intensity blob, reconstruct prep, run stats, and strip intensity_rows.

    Omits intensity_rows so the engine callback does not rewrite the S3 blob.
    Drops allIons from run_qc when empty so the previous snapshot is preserved.
    """
    blob_rows = _fetch_intensity_blob(payload['intensity_blob_s3_key'])
    prep = _reconstruct_prep_from_blob(
        blob_rows,
        payload.get('datasets') or [],
        payload.get('excluded_samples') or [],
    )
    inner = {
        'prep': prep,
        'label_groups': payload.get('label_groups') or [],
        'filters': payload.get('filter') or {},
        'datasets': payload.get('datasets') or [],
    }
    result = run_experiment_prep(experiment_id, run_generation, inner)
    result.pop('intensity_rows', None)
    run_qc = result.get('run_qc') or {}
    if not run_qc.get('allIons'):
        run_qc.pop('allIons', None)
    return result


def _build_all_ions(
    all_ions: List[Dict[str, Any]],
    intensities: Dict[str, Dict[int, float]],
    region_keys: List[str],
) -> List[Dict[str, Any]]:
    """Enrich the prep all_ions snapshot with detection_rate per ion."""
    n_regions = max(1, len(region_keys))
    out: List[Dict[str, Any]] = []
    for entry in all_ions:
        ion_id = entry.get('ion_id')
        if ion_id is None:
            continue
        detected = sum(
            1 for rk in region_keys if (intensities.get(rk) or {}).get(ion_id, 0.0) > 0.0
        )
        out.append(
            {
                'ion_id': ion_id,
                'fdr': entry.get('fdr'),
                'adduct': entry.get('adduct'),
                'moldb_id': entry.get('moldb_id'),
                'moldb_name': entry.get('moldb_name'),
                'detection_rate': detected / n_regions,
            }
        )
    return out
