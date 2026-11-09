from functools import partial

import numpy as np
import pandas as pd
import pytest

from sm.engine.annotation.fdr import FDR, score_to_fdr_map
from tests.consistency.refs import check_ref, load_ref
from tests.consistency.synth import make_formulas
from tests.consistency.tolerances import assert_close, assert_exact, assert_tree

pytestmark = pytest.mark.consistency


def _scores(seed=0):
    rng = np.random.default_rng(seed)
    targets = np.round(rng.beta(5, 2, 300), 2)
    decoys = np.round(rng.beta(2, 5, 600), 2)
    decoys[:100] = 0.0
    return targets, decoys


def _compare_series(actual, expected):
    assert_exact(actual['index'], expected['index'], 'index')
    assert_close(actual['values'], expected['values'], 'FDR_SAME_DECOYS', 'values')


@pytest.mark.parametrize('rule_of_succession', [True, False])
def test_score_to_fdr_map_matches_reference(rule_of_succession):
    targets, decoys = _scores()
    fdr_map = score_to_fdr_map(targets, decoys, 20, rule_of_succession, True)
    assert fdr_map.nunique() > 3
    actual = {'index': fdr_map.index.values, 'values': fdr_map.values}
    check_ref(f'fdr/score_map_ros{int(rule_of_succession)}', actual, _compare_series)


def _make_fdr(analysis_version):
    fdr = FDR(
        fdr_config={'decoy_sample_size': 20},
        chem_mods=[],
        neutral_losses=[],
        target_adducts=['+H', '+Na', '+K'],
        analysis_version=analysis_version,
    )
    fdr.td_df = pd.DataFrame(load_ref(f'decoy/v{analysis_version}/td_df')['data'])
    return fdr


def _formula_msm(fdr, seed=0):
    rng = np.random.default_rng(seed)
    targets = set(fdr.target_modifiers())
    rows = sorted(set(fdr.ion_tuples()))
    msm = [rng.beta(5, 2) if mod in targets else rng.beta(2, 5) for _, mod in rows]
    return pd.DataFrame(
        {'formula': [r[0] for r in rows], 'modifier': [r[1] for r in rows], 'msm': msm}
    )


def _compare_estimate(actual, expected):
    assert_exact(actual['formula'], expected['formula'], 'formula')
    assert_exact(actual['modifier'], expected['modifier'], 'modifier')
    assert_close(actual['msm'], expected['msm'], 'FDR_SAME_DECOYS', 'msm')
    assert_close(actual['fdr'], expected['fdr'], 'FDR_SAME_DECOYS', 'fdr')


@pytest.mark.parametrize('analysis_version', [1, 3])
def test_estimate_fdr_matches_reference(analysis_version):
    fdr = _make_fdr(analysis_version)
    formula_msm = _formula_msm(fdr)
    result = fdr.estimate_fdr(formula_msm, None).sort_values(['formula', 'modifier'])
    assert len(result) > 0
    assert result.fdr.nunique() > 1
    if analysis_version == 1:
        assert set(result.fdr) <= set(FDR.fdr_levels + [1.0])
    else:
        for _, group in result.groupby('modifier'):
            ordered = group.sort_values('msm', ascending=False).fdr.values
            assert np.all(np.diff(ordered) >= -1e-12)
    actual = {col: result[col].tolist() for col in ['formula', 'modifier', 'msm', 'fdr']}
    check_ref(f'fdr/v{analysis_version}/estimate', actual, _compare_estimate)
