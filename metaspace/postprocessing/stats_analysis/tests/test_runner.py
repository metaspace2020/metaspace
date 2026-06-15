"""Runner-level tests against a hand-built prep block."""
import math

import pytest
from tests.fixtures import build_payload, make_payload, make_prep_block

from stats_analysis.runner import run_experiment_prep


def _ions(base: float) -> dict:
    """Three-ion intensity dict; ion 1 separates conditions, ion 2 is noisy."""
    return {1: base, 2: base * 0.5 + 1.0, 3: base * 0.8 + 0.5}


def _region(rk, sid, cond, *, bio=None, tech=None, ds='ds-1', base=1.0, lg='auto_1'):
    return {
        'regionKey': rk,
        'sampleId': sid,
        'datasetId': ds,
        'labelGroupName': lg,
        'condition': cond,
        'biologicalReplicateId': bio,
        'technicalReplicateId': tech,
        'intensities': _ions(base),
    }


def _assert_results_have_pvalue(out):
    assert out['results'], 'expected at least one result row'
    assert any(
        r['p_value'] is not None for r in out['results']
    ), f"all p-values null for test_kind={out['inferred_test']}"


def test_run_experiment_returns_full_run_qc_shape():
    out = run_experiment_prep('exp-1', 1, make_payload())
    assert out['inferred_test'] == 'LIMMA'

    qc = out['run_qc']
    region_keys = {s['regionKey'] for s in qc['samples']}
    assert region_keys == {'r-ctrl-1', 'r-ctrl-2', 'r-tum-1', 'r-tum-2'}
    for s in qc['samples']:
        assert set(s.keys()) >= {
            'regionKey',
            'sampleId',
            'condition',
            'tic',
            'detectionRate',
            'cv',
            'pcaPC1',
            'pcaPC2',
        }
    assert {'pc1', 'pc2'} == set(qc['pcaVariance'].keys())
    assert qc['filterChain'][0]['name'] == 'All annotated ions'
    assert qc['filterChain'][0]['count'] == 5
    assert qc['filterChain'][-1]['name'] == '+FDR <= 0.1'
    assert set(qc['coverage'].keys()) == region_keys
    assert qc['inferredTestPerLabelGroup'] == {'auto_1': 'LIMMA'}

    assert len(out['results']) == 3
    row = out['results'][0]
    assert set(row.keys()) >= {
        'ion_id',
        'label_group_name',
        'lfc',
        'p_value',
        'fdr',
        'detection_rate_a',
        'detection_rate_b',
        'n_a',
        'n_b',
    }
    assert row['n_a'] == 2 and row['n_b'] == 2
    ion1 = next(r for r in out['results'] if r['ion_id'] == 1)
    assert ion1['p_value'] is not None
    assert ion1['p_value'] < 0.5


def test_run_experiment_skips_label_group_with_single_condition():
    payload = build_payload(
        [
            _region('r-1', 's1', 'control', bio='m1', base=10.0),
            _region('r-2', 's2', 'control', bio='m2', base=12.0),
        ]
    )
    out = run_experiment_prep('exp-1', 1, payload)
    assert out['run_qc']['inferredTestPerLabelGroup'] == {'auto_1': 'NOT_ENOUGH_DATA'}
    assert all(
        r['p_value'] is None and r['fdr'] is None
        for r in out['results']
        if r['label_group_name'] == 'auto_1'
    )


def test_run_experiment_falls_back_to_experiment_wide_when_lgs_are_single_condition():
    payload = build_payload(
        [
            _region('r-1', 's1', 'control', bio='m1', base=1.0, lg='control'),
            _region('r-2', 's2', 'control', bio='m2', base=1.2, lg='control'),
            _region('r-3', 's3', 'nash', bio='m3', base=10.0, lg='innoculated'),
            _region('r-4', 's4', 'nash', bio='m4', base=11.0, lg='innoculated'),
        ]
    )
    payload['label_groups'] = [
        {'name': 'control', 'color': '#000'},
        {'name': 'innoculated', 'color': '#111'},
    ]
    out = run_experiment_prep('exp-1', 1, payload)
    per_lg = out['run_qc']['inferredTestPerLabelGroup']
    assert per_lg['control'] == 'NOT_ENOUGH_DATA'
    assert per_lg['innoculated'] == 'NOT_ENOUGH_DATA'
    assert per_lg['__experiment__'] == 'LIMMA'
    assert out['inferred_test'] == 'LIMMA'
    assert 'EXPERIMENT_WIDE_FALLBACK' in out['run_qc']['warnings']
    fb_rows = [r for r in out['results'] if r['label_group_name'] == '__experiment__']
    assert fb_rows, 'expected experiment-wide fallback result rows'
    assert any(r['p_value'] is not None for r in fb_rows)
    assert all(r['n_a'] == 2 and r['n_b'] == 2 for r in fb_rows)


def test_run_experiment_emits_null_p_when_not_enough_replicates():
    """n=1 per arm: test name is still inferred from design, but p/fdr are NULL."""
    payload = make_payload()
    prep = payload['prep']
    prep['samples'] = prep['samples'][:1] + prep['samples'][2:3]
    keep_keys = {s['regionKey'] for s in prep['samples']}
    prep['intensities'] = {k: v for k, v in prep['intensities'].items() if k in keep_keys}
    out = run_experiment_prep('exp-1', 1, payload)
    assert out['inferred_test'] == 'LIMMA'
    assert len(out['results']) > 0
    assert all(r['p_value'] is None and r['fdr'] is None for r in out['results'])
    assert all(r['n_a'] == 1 and r['n_b'] == 1 for r in out['results'])


def test_run_experiment_emits_intensity_rows_skipping_zeros():
    payload = make_payload()
    # Inject a zero intensity for ion 1 in r-ctrl-1 (overrides the 100.0 default).
    payload['prep']['intensities']['r-ctrl-1'][1] = 0.0
    out = run_experiment_prep('exp-1', 1, payload)
    assert 'intensity_rows' in out
    rows = out['intensity_rows']
    assert all(r['intensity'] != 0.0 for r in rows)
    assert not any(r['ion_id'] == 1 and r['region_key'] == 'r-ctrl-1' for r in rows)
    assert any(r['ion_id'] == 1 and r['region_key'] == 'r-tum-1' for r in rows)
    for r in rows:
        assert set(r.keys()) == {'ion_id', 'region_key', 'intensity'}


def test_run_experiment_emits_all_ions_with_detection_rate():
    """run_qc.allIons mirrors the prep snapshot enriched with detection_rate."""
    out = run_experiment_prep('exp-1', 1, make_payload())
    qc = out['run_qc']
    assert 'allIons' in qc
    rows = qc['allIons']
    assert len(rows) == 5
    expected_keys = {'ion_id', 'fdr', 'adduct', 'moldb_id', 'moldb_name', 'detection_rate'}
    for row in rows:
        assert expected_keys <= set(row.keys())
        assert 0.0 <= row['detection_rate'] <= 1.0
    by_id = {r['ion_id']: r for r in rows}
    assert by_id[1]['detection_rate'] == 1.0
    assert by_id[1]['adduct'] == '+H'
    assert by_id[1]['moldb_name'] == 'HMDB'


def test_run_experiment_picks_paired_when_bio_reps_match():
    payload = make_payload()
    # Make bio-reps repeat across conditions: mouse_1 control + mouse_1 tumor, etc.
    bio_map = {
        'r-ctrl-1': 'mouse_1',
        'r-ctrl-2': 'mouse_2',
        'r-tum-1': 'mouse_1',
        'r-tum-2': 'mouse_2',
    }
    for s in payload['prep']['samples']:
        s['biologicalReplicateId'] = bio_map[s['regionKey']]
    out = run_experiment_prep('exp-1', 1, payload)
    assert out['inferred_test'] == 'LIMMA'


def test_scenario_1_two_conditions_one_region_per_sample():
    samples = [
        _region(f'r-c-{i}', f's-c-{i}', 'control', bio=f'm{i}', base=10.0 + i) for i in range(1, 4)
    ] + [
        _region(f'r-t-{i}', f's-t-{i}', 'tumor', bio=f'm{10 + i}', base=100.0 + i)
        for i in range(1, 4)
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    assert out['run_qc']['warnings'] == []
    _assert_results_have_pvalue(out)


def test_scenario_2_three_conditions_kruskal():
    samples = []
    for cond, base in [('A', 10.0), ('B', 50.0), ('C', 100.0)]:
        for i in range(1, 4):
            samples.append(
                _region(f'r-{cond}-{i}', f's-{cond}-{i}', cond, bio=f'{cond}m{i}', base=base + i)
            )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_3_unbalanced_n():
    samples = [
        _region('r-c-1', 's1', 'control', bio='m1', base=10.0),
        _region('r-c-2', 's2', 'control', bio='m2', base=12.0),
        _region('r-t-1', 's3', 'tumor', bio='m3', base=100.0),
        _region('r-t-2', 's4', 'tumor', bio='m4', base=110.0),
        _region('r-t-3', 's5', 'tumor', bio='m5', base=105.0),
        _region('r-t-4', 's6', 'tumor', bio='m6', base=108.0),
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    assert 'UNBALANCED_N' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)


def test_scenario_4_fully_paired():
    samples = []
    for i in range(1, 5):
        samples.append(_region(f'r-c-{i}', f'sc{i}', 'control', bio=f'm{i}', base=10.0 + i))
        samples.append(_region(f'r-t-{i}', f'st{i}', 'tumor', bio=f'm{i}', base=50.0 + i))
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_5_partially_paired():
    # m1, m2 paired across both conditions; m3 control-only; m4 tumor-only.
    samples = [
        _region('r-c-1', 's1', 'control', bio='m1', base=10.0),
        _region('r-c-2', 's2', 'control', bio='m2', base=12.0),
        _region('r-c-3', 's3', 'control', bio='m3', base=11.0),
        _region('r-t-1', 's4', 'tumor', bio='m1', base=50.0),
        _region('r-t-2', 's5', 'tumor', bio='m2', base=55.0),
        _region('r-t-3', 's6', 'tumor', bio='m4', base=53.0),
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    assert 'PARTIAL_PAIRING' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)


def test_scenario_6_friedman_longitudinal():
    # 3 conditions, 4 mice each appearing in all 3 conditions (longitudinal).
    samples = []
    for cond, base in [('t0', 10.0), ('t1', 30.0), ('t2', 60.0)]:
        for i in range(1, 5):
            samples.append(
                _region(f'r-{cond}-{i}', f's-{cond}-{i}', cond, bio=f'm{i}', base=base + i * 0.5)
            )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_7_multi_region_within_one_dataset():
    samples = []
    for i in range(1, 4):
        for ridx in (1, 2):
            samples.append(
                _region(
                    f'r-c-{i}-{ridx}', f's-c-{i}-{ridx}', 'control', bio=f'm{i}', base=10.0 + ridx
                )
            )
            samples.append(
                _region(
                    f'r-t-{i}-{ridx}', f's-t-{i}-{ridx}', 'tumor', bio=f'm{i}', base=80.0 + ridx
                )
            )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert 'MULTI_REGION_AGGREGATED' in out['run_qc']['warnings']
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_8_multi_region_cross_dataset():
    samples = []
    for i in range(1, 4):
        samples.append(
            _region(f'r-c-{i}-a', f's-c-{i}a', 'control', bio=f'm{i}', ds='ds-A', base=10.0 + i)
        )
        samples.append(
            _region(f'r-c-{i}-b', f's-c-{i}b', 'control', bio=f'm{i}', ds='ds-B', base=12.0 + i)
        )
        samples.append(
            _region(f'r-t-{i}-a', f's-t-{i}a', 'tumor', bio=f'm{i}', ds='ds-A', base=80.0 + i)
        )
        samples.append(
            _region(f'r-t-{i}-b', f's-t-{i}b', 'tumor', bio=f'm{i}', ds='ds-B', base=82.0 + i)
        )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert 'MULTI_REGION_AGGREGATED' in out['run_qc']['warnings']
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_9_same_region_label_across_datasets():
    samples = [
        _region('r-c-1', 's1', 'control', bio='m1', ds='ds-A', base=10.0),
        _region('r-c-2', 's2', 'control', bio='m2', ds='ds-B', base=11.0),
        _region('r-c-3', 's3', 'control', bio='m3', ds='ds-C', base=12.0),
        _region('r-t-1', 's4', 'tumor', bio='m4', ds='ds-A', base=80.0),
        _region('r-t-2', 's5', 'tumor', bio='m5', ds='ds-B', base=82.0),
        _region('r-t-3', 's6', 'tumor', bio='m6', ds='ds-C', base=85.0),
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'
    assert out['run_qc']['warnings'] == []
    _assert_results_have_pvalue(out)


def test_scenario_10_different_region_labels_per_condition():
    samples = []
    for cond, base, lg, bio_prefix in [
        ('control', 10.0, 'auto_1', 'lg1c'),
        ('tumor', 80.0, 'auto_1', 'lg1t'),
    ]:
        for i in range(1, 4):
            samples.append(
                _region(
                    f'r-1-{cond}-{i}',
                    f's-1-{cond}-{i}',
                    cond,
                    bio=f'{bio_prefix}{i}',
                    base=base + i,
                    lg=lg,
                )
            )
    for cond, base, lg, bio_prefix in [
        ('control', 5.0, 'auto_2', 'lg2c'),
        ('tumor', 40.0, 'auto_2', 'lg2t'),
    ]:
        for i in range(1, 4):
            samples.append(
                _region(
                    f'r-2-{cond}-{i}',
                    f's-2-{cond}-{i}',
                    cond,
                    bio=f'{bio_prefix}{i}',
                    base=base + i,
                    lg=lg,
                )
            )
    payload = build_payload(samples)
    payload['label_groups'] = [
        {'name': 'auto_1', 'color': '#1'},
        {'name': 'auto_2', 'color': '#2'},
    ]
    out = run_experiment_prep('e', 1, payload)
    per_lg = out['run_qc']['inferredTestPerLabelGroup']
    assert per_lg['auto_1'] == 'LIMMA'
    assert per_lg['auto_2'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_11_tech_reps_one_condition():
    # 3 bio reps in each condition; control has 2 tech reps each (sampleId reused).
    samples = []
    for i in range(1, 4):
        samples.append(
            _region(f'r-c-{i}-a', f'sc{i}', 'control', bio=f'm{i}', tech=f't{i}a', base=10.0 + i)
        )
        samples.append(
            _region(f'r-c-{i}-b', f'sc{i}', 'control', bio=f'm{i}', tech=f't{i}b', base=11.0 + i)
        )
        samples.append(
            _region(f'r-t-{i}', f'st{i}', 'tumor', bio=f'm{10 + i}', tech=f'tt{i}', base=80.0 + i)
        )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert 'TECH_REPS_PARTIAL' not in out['run_qc']['warnings']
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def test_scenario_12_tech_reps_across_conditions():
    samples = []
    for cond, base in [('control', 10.0), ('tumor', 80.0)]:
        for i in range(1, 4):
            sid = f's-{cond}-{i}'
            samples.append(
                _region(f'r-{cond}-{i}-a', sid, cond, bio=f'{cond}m{i}', tech='a', base=base + i)
            )
            samples.append(
                _region(
                    f'r-{cond}-{i}-b', sid, cond, bio=f'{cond}m{i}', tech='b', base=base + i + 0.5
                )
            )
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert 'TECH_REPS_PARTIAL' not in out['run_qc']['warnings']
    assert out['inferred_test'] == 'LIMMA'
    _assert_results_have_pvalue(out)


def _build_payload_k2_simple():
    samples = [
        _region('r-c-1', 's1', 'c1', bio='m1', base=10.0),
        _region('r-c-2', 's2', 'c1', bio='m2', base=11.0),
        _region('r-c-3', 's3', 'c1', bio='m3', base=12.0),
        _region('r-t-1', 's4', 'c2', bio='m4', base=80.0),
        _region('r-t-2', 's5', 'c2', bio='m5', base=82.0),
        _region('r-t-3', 's6', 'c2', bio='m6', base=85.0),
    ]
    return build_payload(samples)


def _build_payload_k3_kruskal():
    samples_def = []
    for cond, base in [('c1', 10.0), ('c2', 50.0), ('c3', 100.0)]:
        for i in range(1, 5):
            samples_def.append(
                {
                    'regionKey': f'r-{cond}-{i}',
                    'sampleId': f's-{cond}-{i}',
                    'datasetId': 'ds-1',
                    'labelGroupName': 'auto_1',
                    'condition': cond,
                    'biologicalReplicateId': f'{cond}m{i}',
                    'technicalReplicateId': None,
                    'intensities': {1: base + i},
                }
            )
    return build_payload(samples_def, n_ions=1)


def _build_payload_k3_friedman_paired():
    samples_def = []
    for cond, base in [('c1', 10.0), ('c2', 30.0), ('c3', 60.0)]:
        for i in range(1, 5):
            samples_def.append(
                {
                    'regionKey': f'r-{cond}-{i}',
                    'sampleId': f's-{cond}-{i}',
                    'datasetId': 'ds-1',
                    'labelGroupName': 'auto_1',
                    'condition': cond,
                    'biologicalReplicateId': f'm{i}',
                    'technicalReplicateId': None,
                    'intensities': {1: base + i * 0.5},
                }
            )
    return build_payload(samples_def, n_ions=1)


def _build_payload_k3_kruskal_many_ions(n_ions: int = 10):
    samples_def = []
    for cond, base in [('c1', 10.0), ('c2', 50.0), ('c3', 100.0)]:
        for i in range(1, 5):
            intensities = {
                ion_id: (base + i) * (0.5 + 0.1 * ion_id) for ion_id in range(1, n_ions + 1)
            }
            samples_def.append(
                {
                    'regionKey': f'r-{cond}-{i}',
                    'sampleId': f's-{cond}-{i}',
                    'datasetId': 'ds-1',
                    'labelGroupName': 'auto_1',
                    'condition': cond,
                    'biologicalReplicateId': f'{cond}m{i}',
                    'technicalReplicateId': None,
                    'intensities': intensities,
                }
            )
    return build_payload(samples_def, n_ions=n_ions)


def test_k2_emits_single_pair_row_per_ion():
    """K=2 (LIMMA) — one pair row per (ion, label_group), no omnibus."""
    payload = _build_payload_k2_simple()
    out = run_experiment_prep('exp', 1, payload)
    rows = out['results']
    by_key = {}
    for r in rows:
        by_key.setdefault((r['ion_id'], r['label_group_name']), []).append(r)
    for key, rs in by_key.items():
        assert len(rs) == 1, f"K=2 should produce 1 row, got {len(rs)} for {key}"
        r = rs[0]
        assert r['cond_a'] is not None
        assert r['cond_b'] is not None
        assert r['cond_a'] < r['cond_b'], "Pair ordering must be canonical"
        assert r['lfc'] is not None
        assert r['n_a'] is not None and r['n_b'] is not None


def test_k3_kruskal_emits_omnibus_plus_pairs():
    payload = _build_payload_k3_kruskal()
    out = run_experiment_prep('exp', 1, payload)
    rows = out['results']
    omnibus = [r for r in rows if r['cond_a'] is None]
    pairs = [r for r in rows if r['cond_a'] is not None]
    assert len(omnibus) == 1
    assert len(pairs) == 3
    o = omnibus[0]
    for field in (
        'cond_a',
        'cond_b',
        'lfc',
        'n_a',
        'n_b',
        'mean_a',
        'mean_b',
        'detection_rate_a',
        'detection_rate_b',
    ):
        assert o[field] is None, f"omnibus.{field} must be None"
    assert o['p_value'] is not None
    pair_keys = {(r['cond_a'], r['cond_b']) for r in pairs}
    assert all(a < b for a, b in pair_keys)
    for r in pairs:
        assert r['lfc'] is not None
        assert r['n_a'] is not None and r['n_b'] is not None
        assert r['mean_a'] is not None and r['mean_b'] is not None


def test_k3_friedman_emits_omnibus_plus_pairs():
    payload = _build_payload_k3_friedman_paired()
    out = run_experiment_prep('exp', 1, payload)
    rows = out['results']
    assert sum(1 for r in rows if r['cond_a'] is None) == 1
    assert sum(1 for r in rows if r['cond_a'] is not None) == 3


def test_cross_row_consistency_per_condition_stats():
    payload = _build_payload_k3_kruskal()
    rows = run_experiment_prep('exp', 1, payload)['results']
    pairs = [r for r in rows if r['cond_a'] is not None]
    by_ion_lg = {}
    for r in pairs:
        key = (r['ion_id'], r['label_group_name'])
        by_ion_lg.setdefault(key, []).append(r)
    for rs in by_ion_lg.values():
        per_cond_n, per_cond_mean = {}, {}
        for r in rs:
            for arm in ('a', 'b'):
                c = r[f'cond_{arm}']
                n = r[f'n_{arm}']
                m = r[f'mean_{arm}']
                if c in per_cond_n:
                    assert per_cond_n[c] == n
                    assert per_cond_mean[c] == m
                else:
                    per_cond_n[c] = n
                    per_cond_mean[c] = m


def test_fdr_scoped_per_contrast():
    payload = _build_payload_k3_kruskal_many_ions()
    rows = run_experiment_prep('exp', 1, payload)['results']
    from collections import defaultdict

    scopes = defaultdict(list)
    for r in rows:
        scopes[(r['cond_a'], r['cond_b'])].append((r['p_value'], r['fdr']))
    for scope, pairs in scopes.items():
        finite = [(p, q) for p, q in pairs if p is not None and q is not None]
        finite.sort()
        qs = [q for _, q in finite]
        assert qs == sorted(qs), f"FDR not monotone within scope {scope}"


def test_scenario_13_tech_reps_partial():
    # control has tech reps; tumor does not.
    samples = []
    for i in range(1, 4):
        sid = f's-c-{i}'
        samples.append(_region(f'r-c-{i}-a', sid, 'control', bio=f'cm{i}', tech='a', base=10.0 + i))
        samples.append(_region(f'r-c-{i}-b', sid, 'control', bio=f'cm{i}', tech='b', base=11.0 + i))
    for i in range(1, 4):
        samples.append(_region(f'r-t-{i}', f's-t-{i}', 'tumor', bio=f'tm{i}', base=80.0 + i))
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert 'TECH_REPS_PARTIAL' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)


def test_limma_pvalue_small_for_well_separated_conditions():
    """With large effect size, moderated t p-value must be < 0.05."""
    samples = [
        _region(f'r-c-{i}', f's-c-{i}', 'control', bio=f'm{i}', base=10.0) for i in range(1, 5)
    ] + [
        _region(f'r-t-{i}', f's-t-{i}', 'tumor', bio=f'm{10 + i}', base=200.0) for i in range(1, 5)
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    ion1 = next(r for r in out['results'] if r['ion_id'] == 1 and r['cond_a'] is not None)
    assert ion1['p_value'] is not None
    assert ion1['p_value'] < 0.05, f"expected p < 0.05 for large effect, got {ion1['p_value']}"


def test_limma_lfc_sign_matches_condition_ordering():
    """log2FC must be positive when cond_b mean > cond_a mean.

    Alphabetically 'control' < 'tumor', so cond_a=control, cond_b=tumor.
    tumor intensities are much higher, so lfc must be > 0.
    """
    samples = [
        _region(f'r-c-{i}', f's-c-{i}', 'control', bio=f'm{i}', base=10.0) for i in range(1, 5)
    ] + [
        _region(f'r-t-{i}', f's-t-{i}', 'tumor', bio=f'm{10 + i}', base=80.0) for i in range(1, 5)
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    pair_rows = [r for r in out['results'] if r['cond_a'] is not None]
    assert pair_rows
    for r in pair_rows:
        assert r['cond_a'] == 'control' and r['cond_b'] == 'tumor'
        assert r['lfc'] > 0, f"expected lfc > 0 (tumor > control), got {r['lfc']}"


def test_limma_rho_positive_for_paired_design():
    """Block correlation must be > 0 when the same bio-rep appears in both conditions."""
    from collections import OrderedDict as _OD
    from stats_analysis.runner import _build_limma_inputs
    from stats_analysis.limma_python import run_limma as _run_limma

    samples = [
        _region(f'r-c-{i}', f'sc{i}', 'control', bio=f'm{i}', base=10.0 + i)
        for i in range(1, 5)
    ] + [
        _region(f'r-t-{i}', f'st{i}', 'tumor', bio=f'm{i}', base=50.0 + i)
        for i in range(1, 5)
    ]
    payload = build_payload(samples)
    prep = payload['prep']
    intensities = prep['intensities']
    groups: _OD = _OD()
    for s in prep['samples']:
        groups.setdefault(s['condition'], []).append(s)
    surviving_ids = sorted({iid for rk_map in intensities.values() for iid in rk_map})

    Y, X, block_ids, contrasts, _ = _build_limma_inputs(groups, intensities, surviving_ids)
    result = _run_limma(Y, X, block_ids, contrasts)
    assert result.rho > 0.0, f'expected rho > 0 for paired design, got {result.rho}'


def test_null_fallback_k3_emits_all_pairs_and_omnibus():
    """K=3 with n=1 per arm: limma fails, fallback emits 1 omnibus + 3 null pair rows per ion."""
    samples = [
        _region('r-a', 'sa', 'A', bio='m1', base=10.0),
        _region('r-b', 'sb', 'B', bio='m2', base=50.0),
        _region('r-c', 'sc', 'C', bio='m3', base=100.0),
    ]
    out = run_experiment_prep('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'LIMMA'

    omnibus = [r for r in out['results'] if r['cond_a'] is None]
    pairs = [r for r in out['results'] if r['cond_a'] is not None]
    n_ions = len({r['ion_id'] for r in out['results']})

    assert len(omnibus) == n_ions, f'expected {n_ions} omnibus rows, got {len(omnibus)}'
    assert len(pairs) == 3 * n_ions, f'expected {3 * n_ions} pair rows, got {len(pairs)}'
    assert all(r['p_value'] is None for r in out['results'])
    assert all(r['cond_a'] < r['cond_b'] for r in pairs)
