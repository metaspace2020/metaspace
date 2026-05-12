"""Runner-level tests against a hand-built prep block."""
import math

import pytest
from tests.fixtures import build_payload, make_payload, make_prep_block

from stats_analysis.runner import run_experiment


def _ions(base: float) -> dict:
    """Three-ion intensity dict; ion 1 separates conditions, ion 2 is noisy."""
    return {1: base, 2: base * 0.5 + 1.0, 3: base * 0.8 + 0.5}


def _region(rk, sid, cond, *, bio=None, tech=None, ds='ds-1', base=1.0, lg='auto_1'):
    return {
        'regionKey': rk, 'sampleId': sid, 'datasetId': ds, 'labelGroupName': lg,
        'condition': cond, 'biologicalReplicateId': bio,
        'technicalReplicateId': tech, 'intensities': _ions(base),
    }


def _assert_results_have_pvalue(out):
    assert out['results'], 'expected at least one result row'
    assert any(r['p_value'] is not None for r in out['results']), \
        f"all p-values null for test_kind={out['inferred_test']}"


def test_run_experiment_returns_full_run_qc_shape():
    out = run_experiment('exp-1', 1, make_payload())
    # 4 unpaired regions across 2 conditions, 2 per arm -> Wilcoxon rank-sum.
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'

    qc = out['run_qc']
    region_keys = {s['regionKey'] for s in qc['samples']}
    assert region_keys == {'r-ctrl-1', 'r-ctrl-2', 'r-tum-1', 'r-tum-2'}
    for s in qc['samples']:
        assert set(s.keys()) >= {
            'regionKey', 'sampleId', 'condition', 'tic',
            'detectionRate', 'cv', 'pcaPC1', 'pcaPC2',
        }
    assert {'pc1', 'pc2'} == set(qc['pcaVariance'].keys())
    assert qc['filterChain'][0]['name'] == 'All annotated ions'
    assert qc['filterChain'][0]['count'] == 5
    assert qc['filterChain'][-1]['name'] == '+FDR <= 0.1'
    assert set(qc['coverage'].keys()) == region_keys
    assert qc['inferredTestPerLabelGroup'] == {'auto_1': 'WILCOXON_UNPAIRED'}

    # 1 label group x 3 surviving ions = 3 result rows.
    assert len(out['results']) == 3
    row = out['results'][0]
    assert set(row.keys()) >= {
        'ion_id', 'label_group_name', 'lfc', 'p_value', 'fdr',
        'detection_rate_a', 'detection_rate_b', 'n_a', 'n_b',
    }
    assert row['n_a'] == 2 and row['n_b'] == 2
    # With clear separation between control and tumor on ion 1, p should be small.
    ion1 = next(r for r in out['results'] if r['ion_id'] == 1)
    assert ion1['p_value'] is not None
    assert ion1['p_value'] < 0.5


def test_run_experiment_skips_label_group_with_single_condition():
    payload = build_payload([
        _region('r-1', 's1', 'control', bio='m1', base=10.0),
        _region('r-2', 's2', 'control', bio='m2', base=12.0),
    ])
    out = run_experiment('exp-1', 1, payload)
    assert out['run_qc']['inferredTestPerLabelGroup'] == {'auto_1': 'NOT_ENOUGH_DATA'}
    assert all(
        r['p_value'] is None and r['fdr'] is None
        for r in out['results']
        if r['label_group_name'] == 'auto_1'
    )


def test_run_experiment_emits_null_p_when_not_enough_replicates():
    """n=1 per arm: test name is still inferred from design, but p/fdr are NULL."""
    payload = make_payload()
    prep = payload['prep']
    prep['samples'] = prep['samples'][:1] + prep['samples'][2:3]
    keep_keys = {s['regionKey'] for s in prep['samples']}
    prep['intensities'] = {k: v for k, v in prep['intensities'].items() if k in keep_keys}
    out = run_experiment('exp-1', 1, payload)
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    # Degenerate cases emit p_value=NULL and fdr=NULL.
    assert len(out['results']) > 0
    assert all(r['p_value'] is None and r['fdr'] is None for r in out['results'])
    assert all(r['n_a'] == 1 and r['n_b'] == 1 for r in out['results'])


def test_run_experiment_emits_intensity_rows_skipping_zeros():
    payload = make_payload()
    # Inject a zero intensity for ion 1 in r-ctrl-1 (overrides the 100.0 default).
    payload['prep']['intensities']['r-ctrl-1'][1] = 0.0
    out = run_experiment('exp-1', 1, payload)
    assert 'intensity_rows' in out
    rows = out['intensity_rows']
    assert all(r['intensity'] != 0.0 for r in rows)
    # No row should reference (ion=1, region=r-ctrl-1) since we zeroed it.
    assert not any(r['ion_id'] == 1 and r['region_key'] == 'r-ctrl-1' for r in rows)
    # Some rows should still be emitted for other (ion, region) combos.
    assert any(r['ion_id'] == 1 and r['region_key'] == 'r-tum-1' for r in rows)
    # Each row has the expected keys.
    for r in rows:
        assert set(r.keys()) == {'ion_id', 'region_key', 'intensity'}


def test_run_experiment_emits_all_ions_with_detection_rate():
    """run_qc.allIons mirrors the prep snapshot enriched with detection_rate."""
    out = run_experiment('exp-1', 1, make_payload())
    qc = out['run_qc']
    assert 'allIons' in qc
    rows = qc['allIons']
    assert len(rows) == 5
    # Required fields per AllIonRow contract.
    expected_keys = {'ion_id', 'fdr', 'adduct', 'moldb_id', 'moldb_name', 'detection_rate'}
    for row in rows:
        assert expected_keys <= set(row.keys())
        assert 0.0 <= row['detection_rate'] <= 1.0
    # Ion 1 is detected in all 4 regions in the fixture (intensity > 0).
    by_id = {r['ion_id']: r for r in rows}
    assert by_id[1]['detection_rate'] == 1.0
    assert by_id[1]['adduct'] == '+H'
    assert by_id[1]['moldb_name'] == 'HMDB'


def test_run_experiment_picks_paired_when_bio_reps_match():
    payload = make_payload()
    # Make bio-reps repeat across conditions: mouse_1 control + mouse_1 tumor, etc.
    bio_map = {
        'r-ctrl-1': 'mouse_1', 'r-ctrl-2': 'mouse_2',
        'r-tum-1':  'mouse_1', 'r-tum-2':  'mouse_2',
    }
    for s in payload['prep']['samples']:
        s['biologicalReplicateId'] = bio_map[s['regionKey']]
    out = run_experiment('exp-1', 1, payload)
    assert out['inferred_test'] == 'WILCOXON_PAIRED'


# ---------------------------------------------------------------------------
# Track C — design1.csv scenarios 1–13. One test per scenario.
# Each asserts (a) inferred_test, (b) warnings emitted, (c) p-values run.
# ---------------------------------------------------------------------------


def test_scenario_1_two_conditions_one_region_per_sample():
    samples = [
        _region(f'r-c-{i}', f's-c-{i}', 'control', bio=f'm{i}', base=10.0 + i)
        for i in range(1, 4)
    ] + [
        _region(f'r-t-{i}', f's-t-{i}', 'tumor', bio=f'm{10 + i}', base=100.0 + i)
        for i in range(1, 4)
    ]
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    assert out['run_qc']['warnings'] == []
    _assert_results_have_pvalue(out)


def test_scenario_2_three_conditions_kruskal():
    samples = []
    for cond, base in [('A', 10.0), ('B', 50.0), ('C', 100.0)]:
        for i in range(1, 4):
            samples.append(_region(f'r-{cond}-{i}', f's-{cond}-{i}', cond,
                                   bio=f'{cond}m{i}', base=base + i))
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'KRUSKAL_WALLIS'
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
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    assert 'UNBALANCED_N' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)


def test_scenario_4_fully_paired():
    samples = []
    for i in range(1, 5):
        samples.append(_region(f'r-c-{i}', f'sc{i}', 'control',
                               bio=f'm{i}', base=10.0 + i))
        samples.append(_region(f'r-t-{i}', f'st{i}', 'tumor',
                               bio=f'm{i}', base=50.0 + i))
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'WILCOXON_PAIRED'
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
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'WILCOXON_PAIRED_PARTIAL'
    assert 'PARTIAL_PAIRING' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)


def test_scenario_6_friedman_longitudinal():
    # 3 conditions, 4 mice each appearing in all 3 conditions (longitudinal).
    samples = []
    for cond, base in [('t0', 10.0), ('t1', 30.0), ('t2', 60.0)]:
        for i in range(1, 5):
            samples.append(_region(f'r-{cond}-{i}', f's-{cond}-{i}', cond,
                                   bio=f'm{i}', base=base + i * 0.5))
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'FRIEDMAN'
    _assert_results_have_pvalue(out)


def test_scenario_7_multi_region_within_one_dataset():
    # Two regions per (bio, condition) — multi-region, must aggregate.
    samples = []
    for i in range(1, 4):
        for ridx in (1, 2):
            samples.append(_region(f'r-c-{i}-{ridx}', f's-c-{i}-{ridx}',
                                   'control', bio=f'm{i}', base=10.0 + ridx))
            samples.append(_region(f'r-t-{i}-{ridx}', f's-t-{i}-{ridx}',
                                   'tumor', bio=f'm{i}', base=80.0 + ridx))
    out = run_experiment('e', 1, build_payload(samples))
    assert 'MULTI_REGION_AGGREGATED' in out['run_qc']['warnings']
    # After aggregation the bio_reps overlap fully across conditions -> paired.
    assert out['inferred_test'] == 'WILCOXON_PAIRED'
    _assert_results_have_pvalue(out)


def test_scenario_8_multi_region_cross_dataset():
    samples = []
    for i in range(1, 4):
        # Same bio_rep contributes from two datasets in the same condition.
        samples.append(_region(f'r-c-{i}-a', f's-c-{i}a', 'control',
                               bio=f'm{i}', ds='ds-A', base=10.0 + i))
        samples.append(_region(f'r-c-{i}-b', f's-c-{i}b', 'control',
                               bio=f'm{i}', ds='ds-B', base=12.0 + i))
        samples.append(_region(f'r-t-{i}-a', f's-t-{i}a', 'tumor',
                               bio=f'm{i}', ds='ds-A', base=80.0 + i))
        samples.append(_region(f'r-t-{i}-b', f's-t-{i}b', 'tumor',
                               bio=f'm{i}', ds='ds-B', base=82.0 + i))
    out = run_experiment('e', 1, build_payload(samples))
    assert 'MULTI_REGION_AGGREGATED' in out['run_qc']['warnings']
    assert out['inferred_test'] == 'WILCOXON_PAIRED'
    _assert_results_have_pvalue(out)


def test_scenario_9_same_region_label_across_datasets():
    # Single label group, regions drawn from multiple datasets -> normal split.
    samples = [
        _region('r-c-1', 's1', 'control', bio='m1', ds='ds-A', base=10.0),
        _region('r-c-2', 's2', 'control', bio='m2', ds='ds-B', base=11.0),
        _region('r-c-3', 's3', 'control', bio='m3', ds='ds-C', base=12.0),
        _region('r-t-1', 's4', 'tumor', bio='m4', ds='ds-A', base=80.0),
        _region('r-t-2', 's5', 'tumor', bio='m5', ds='ds-B', base=82.0),
        _region('r-t-3', 's6', 'tumor', bio='m6', ds='ds-C', base=85.0),
    ]
    out = run_experiment('e', 1, build_payload(samples))
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    assert out['run_qc']['warnings'] == []
    _assert_results_have_pvalue(out)


def test_scenario_10_different_region_labels_per_condition():
    # Two label groups, each with its own arrangement.
    samples = []
    for cond, base, lg, bio_prefix in [
        ('control', 10.0, 'auto_1', 'lg1c'), ('tumor', 80.0, 'auto_1', 'lg1t'),
    ]:
        for i in range(1, 4):
            samples.append(_region(f'r-1-{cond}-{i}', f's-1-{cond}-{i}', cond,
                                   bio=f'{bio_prefix}{i}', base=base + i, lg=lg))
    for cond, base, lg, bio_prefix in [
        ('control', 5.0, 'auto_2', 'lg2c'), ('tumor', 40.0, 'auto_2', 'lg2t'),
    ]:
        for i in range(1, 4):
            samples.append(_region(f'r-2-{cond}-{i}', f's-2-{cond}-{i}', cond,
                                   bio=f'{bio_prefix}{i}', base=base + i, lg=lg))
    payload = build_payload(samples)
    payload['label_groups'] = [
        {'name': 'auto_1', 'color': '#1'},
        {'name': 'auto_2', 'color': '#2'},
    ]
    out = run_experiment('e', 1, payload)
    per_lg = out['run_qc']['inferredTestPerLabelGroup']
    assert per_lg['auto_1'] == 'WILCOXON_UNPAIRED'
    assert per_lg['auto_2'] == 'WILCOXON_UNPAIRED'
    _assert_results_have_pvalue(out)


def test_scenario_11_tech_reps_one_condition():
    # 3 bio reps in each condition; control has 2 tech reps each (sampleId reused).
    samples = []
    for i in range(1, 4):
        samples.append(_region(f'r-c-{i}-a', f'sc{i}', 'control',
                               bio=f'm{i}', tech=f't{i}a', base=10.0 + i))
        samples.append(_region(f'r-c-{i}-b', f'sc{i}', 'control',
                               bio=f'm{i}', tech=f't{i}b', base=11.0 + i))
        samples.append(_region(f'r-t-{i}', f'st{i}', 'tumor',
                               bio=f'm{10 + i}', tech=f'tt{i}', base=80.0 + i))
    out = run_experiment('e', 1, build_payload(samples))
    # Tech-reps fully populated so no PARTIAL warning expected.
    assert 'TECH_REPS_PARTIAL' not in out['run_qc']['warnings']
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    _assert_results_have_pvalue(out)


def test_scenario_12_tech_reps_across_conditions():
    samples = []
    for cond, base in [('control', 10.0), ('tumor', 80.0)]:
        for i in range(1, 4):
            sid = f's-{cond}-{i}'
            samples.append(_region(f'r-{cond}-{i}-a', sid, cond,
                                   bio=f'{cond}m{i}', tech='a', base=base + i))
            samples.append(_region(f'r-{cond}-{i}-b', sid, cond,
                                   bio=f'{cond}m{i}', tech='b', base=base + i + 0.5))
    out = run_experiment('e', 1, build_payload(samples))
    assert 'TECH_REPS_PARTIAL' not in out['run_qc']['warnings']
    assert out['inferred_test'] == 'WILCOXON_UNPAIRED'
    _assert_results_have_pvalue(out)


def test_scenario_13_tech_reps_partial():
    # control has tech reps; tumor does not.
    samples = []
    for i in range(1, 4):
        sid = f's-c-{i}'
        samples.append(_region(f'r-c-{i}-a', sid, 'control',
                               bio=f'cm{i}', tech='a', base=10.0 + i))
        samples.append(_region(f'r-c-{i}-b', sid, 'control',
                               bio=f'cm{i}', tech='b', base=11.0 + i))
    for i in range(1, 4):
        samples.append(_region(f'r-t-{i}', f's-t-{i}', 'tumor',
                               bio=f'tm{i}', base=80.0 + i))
    out = run_experiment('e', 1, build_payload(samples))
    assert 'TECH_REPS_PARTIAL' in out['run_qc']['warnings']
    _assert_results_have_pvalue(out)
