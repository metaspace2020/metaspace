import base64

import numpy as np
import pandas as pd
import pytest

from sm.engine.annotation.fdr import FDR
from sm.engine.annotation_lithops.io import deserialize, serialize
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_formulas, make_image_cases
from tests.consistency.tolerances import assert_exact

pytestmark = pytest.mark.consistency


def _fdr():
    fdr = FDR({'decoy_sample_size': 5}, [], [], ['+H', '+Na'], 3)
    fdr.decoy_adducts_selection(make_formulas(10))
    return fdr


def _objects():
    rng = np.random.default_rng(0)
    frame = pd.DataFrame(
        {
            'formula': ['H2O', 'CO2', 'CH4'],
            'mz': rng.random(3) * 500,
            'n': np.array([1, 2, 3], dtype=np.uint32),
            'flag': [True, False, True],
        }
    )
    fdr = _fdr()
    return {
        'dataframe': frame,
        'fdr_data': {'id': 1, 'targeted': False, 'fdr': fdr, 'formula_map_df': fdr.td_df},
        'coo': make_image_cases()[0].images[0],
        'frame_list': [frame, frame.assign(mz=frame.mz * 2)],
    }


def _assert_equal(name, actual, expected):
    if name == 'coo':
        assert actual.shape == expected.shape
        assert np.array_equal(actual.toarray(), expected.toarray())
    elif name == 'frame_list':
        assert len(actual) == len(expected)
        for left, right in zip(actual, expected):
            assert_exact(left, right, name)
    elif name == 'fdr_data':
        assert (actual['id'], actual['targeted']) == (expected['id'], expected['targeted'])
        assert_exact(actual['fdr'].td_df, expected['fdr'].td_df, name)
        assert_exact(actual['formula_map_df'], expected['formula_map_df'], name)
    else:
        assert_exact(actual, expected, name)


def test_roundtrip_preserves_objects():
    for name, obj in _objects().items():
        _assert_equal(name, deserialize(serialize(obj)), obj)


def test_golden_blobs_load_identically():
    objects = _objects()
    actual = {
        name: {'b64': base64.b64encode(serialize(obj)).decode('ascii')}
        for name, obj in objects.items()
    }

    def compare(_, expected):
        assert set(expected) == set(objects)
        for name, blob in expected.items():
            loaded = deserialize(base64.b64decode(blob['b64']))
            _assert_equal(name, loaded, objects[name])

    check_ref('serialization/blobs', actual, compare)


def test_corrupt_blob_fails_cleanly():
    blob = serialize(_objects()['dataframe'])
    with pytest.raises(Exception):
        deserialize(blob[: len(blob) // 2])
