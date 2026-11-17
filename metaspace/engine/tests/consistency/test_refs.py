import json
from pathlib import Path

import numpy as np
import pytest

from tests.consistency import refs
from tests.consistency.tolerances import assert_exact
from tests.consistency.tools.regen_refs import check_clean, plan_local_run

pytestmark = pytest.mark.consistency


@pytest.fixture()
def tmp_refs(tmp_path, monkeypatch):
    monkeypatch.setattr(refs, 'REF_DIR', tmp_path)
    monkeypatch.delenv('CONSISTENCY_REGEN', raising=False)
    return tmp_path


def _exact(actual, expected):
    assert_exact(actual['x'], expected['x'])


def test_check_ref_missing_names_file_and_command(tmp_refs):
    with pytest.raises(AssertionError) as exc:
        refs.check_ref('isocalc/v3/envelopes', {'x': [1.0]}, _exact)
    message = str(exc.value)
    assert 'missing reference isocalc/v3/envelopes' in message
    assert 'python -m tests.consistency.tools.regen_refs' in message


def test_check_ref_roundtrip_in_regen_mode(tmp_refs, monkeypatch):
    actual = {'x': np.array([0.1, 0.2, float('nan')])}
    monkeypatch.setenv('CONSISTENCY_REGEN', '1')
    refs.check_ref('a/b', actual, _exact)
    assert (tmp_refs / 'a' / 'b.json').exists()
    monkeypatch.delenv('CONSISTENCY_REGEN')
    refs.check_ref('a/b', actual, _exact)


def test_check_ref_failure_includes_provenance_diff(tmp_refs):
    path = tmp_refs / 'p.json'
    prov = dict(refs.provenance(), numpy='1.0.0')
    path.write_text(json.dumps({'provenance': prov, 'data': {'x': [1.0]}}))
    with pytest.raises(AssertionError) as exc:
        refs.check_ref('p', {'x': [2.0]}, _exact)
    message = str(exc.value)
    assert 'numpy' in message
    assert '1.0.0' in message


def test_floats_roundtrip_bitwise(tmp_refs, monkeypatch):
    values = np.random.default_rng(0).random(200) * 10.0 ** np.random.default_rng(1).integers(
        -8, 8, 200
    )
    monkeypatch.setenv('CONSISTENCY_REGEN', '1')
    refs.check_ref('f', {'x': values}, _exact)
    loaded = np.array(refs.load_ref('f')['data']['x'])
    assert np.array_equal(loaded, values)


def test_regen_refuses_dirty_tree():
    status = ' M metaspace/engine/sm/engine/annotation/fdr.py\n?? metaspace/engine/tests/consistency/refs/a.json\n'
    dirty = check_clean(status, 'metaspace/engine/tests/consistency/')
    assert dirty == ['metaspace/engine/sm/engine/annotation/fdr.py']
    assert check_clean('', 'metaspace/engine/tests/consistency/') == []


def test_local_regen_plan_sets_regen_env_and_runs_from_engine_dir():
    root = Path('/repo')
    cmd, cwd, env = plan_local_run(root, ['tests/consistency/t1_components'], 'abc123')
    assert cwd == root / 'metaspace' / 'engine'
    assert env == {'CONSISTENCY_REGEN': '1', 'CONSISTENCY_GIT_SHA': 'abc123'}
    assert 'pytest' in cmd and cmd[-1] == 'tests/consistency/t1_components'
