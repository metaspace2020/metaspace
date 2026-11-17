from functools import partial

import pytest

from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_ds_config, make_formulas
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency

SIGMAS = [0.000619, 0.001238, 0.002476]
CHARGES = [1, -1]
INSTRUMENTS = {1: ['TOF'], 3: ['TOF', 'Orbitrap', 'FTICR']}
N_FORMULAS = 60


@pytest.mark.parametrize('analysis_version', [1, 3])
def test_envelopes_match_reference(analysis_version):
    formulas = make_formulas(N_FORMULAS)
    actual = {}
    for instrument in INSTRUMENTS[analysis_version]:
        for sigma in SIGMAS:
            for charge in CHARGES:
                config = make_ds_config(analysis_version, instrument, charge, sigma)
                isocalc = IsocalcWrapper(config)
                for formula in formulas:
                    mzs, ints = isocalc.centroids(formula)
                    key = f'{formula}|{sigma}|{charge}|{instrument}'
                    actual[key] = {
                        'mzs': None if mzs is None else mzs.tolist(),
                        'ints': None if ints is None else ints.tolist(),
                    }
    assert any(v['mzs'] is not None for v in actual.values())
    check_ref(
        f'isocalc/v{analysis_version}/envelopes', actual, partial(assert_tree, tol='NUM_TIGHT')
    )
