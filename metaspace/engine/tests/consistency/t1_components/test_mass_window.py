from functools import partial

import numpy as np
import pytest

from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper, mass_accuracy_half_width
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_ds_config
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency

INSTRUMENTS = ['TOF', 'Orbitrap', 'FTICR']
MZS = np.linspace(50, 2000, 40)


def _bounds(analysis_version, instrument):
    isocalc = IsocalcWrapper(make_ds_config(analysis_version, instrument, ppm=3))
    return isocalc.mass_accuracy_bounds(MZS)


def test_mass_window_matches_reference():
    actual = {'half_width': {}, 'bounds': {}}
    for instrument in INSTRUMENTS:
        for ppm in [1, 3, 5]:
            actual['half_width'][f'{instrument}|{ppm}'] = mass_accuracy_half_width(
                MZS, instrument, ppm
            ).tolist()
        for version in [1, 2, 3]:
            lower, upper = _bounds(version, instrument)
            actual['bounds'][f'v{version}|{instrument}'] = {
                'lower': lower.tolist(),
                'upper': upper.tolist(),
            }
    assert all(np.all(np.array(v) > 0) for v in actual['half_width'].values())
    check_ref('isocalc/window', actual, partial(assert_tree, tol='NUM_TIGHT'))


def test_window_version_behaviour():
    for instrument in INSTRUMENTS:
        v1, v2, v3 = (_bounds(v, instrument) for v in [1, 2, 3])
        assert np.array_equal(v1[0], v3[0]) and np.array_equal(v1[1], v3[1])
        if instrument == 'TOF':
            assert np.array_equal(v1[0], v2[0])
        else:
            assert not np.array_equal(v1[0], v2[0])
