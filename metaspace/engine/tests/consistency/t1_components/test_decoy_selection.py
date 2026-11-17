from functools import partial

import numpy as np
import pytest

from sm.engine.annotation.fdr import FDR
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_formulas
from tests.consistency.tolerances import assert_exact, assert_tree

pytestmark = pytest.mark.consistency

TARGET_ADDUCTS = ['+H', '+Na', '+K']


def _selection(analysis_version, formulas):
    fdr = FDR(
        fdr_config={'decoy_sample_size': 20},
        chem_mods=[],
        neutral_losses=[],
        target_adducts=TARGET_ADDUCTS,
        analysis_version=analysis_version,
    )
    fdr.decoy_adducts_selection(formulas)
    return fdr.td_df


@pytest.mark.parametrize('analysis_version', [1, 3])
def test_decoy_selection_matches_reference(analysis_version):
    td_df = _selection(analysis_version, make_formulas(40))
    actual = {col: td_df[col].tolist() for col in ['formula', 'tm', 'dm']}
    check_ref(f'decoy/v{analysis_version}/td_df', actual, partial(assert_tree, tol=None))


@pytest.mark.xfail(
    strict=True, reason='decoy draws follow input formula order; passes once input is sorted()'
)
@pytest.mark.parametrize('analysis_version', [1, 3])
def test_decoy_selection_invariant_to_formula_order(analysis_version):
    formulas = make_formulas(40)
    shuffled = list(np.random.default_rng(0).permutation(formulas))
    assert_exact(_selection(analysis_version, shuffled), _selection(analysis_version, formulas))


@pytest.mark.parametrize('analysis_version', [1, 3])
def test_decoys_exclude_target_elements(analysis_version):
    td_df = _selection(analysis_version, make_formulas(40))
    assert not set(td_df.dm) & set(TARGET_ADDUCTS)
    assert len(td_df) > 0
