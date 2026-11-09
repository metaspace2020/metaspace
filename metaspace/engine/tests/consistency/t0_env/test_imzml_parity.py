from functools import partial

import numpy as np
import pytest

from sm.engine.annotation.imzml_reader import FSImzMLReader
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_spectrum_set, write_imzml
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency


@pytest.mark.parametrize(
    'mode, mz_dtype',
    [('processed', np.float32), ('continuous', np.float32), ('processed', np.float64)],
)
def test_imzml_parsing_matches_reference(tmp_path, mode, mz_dtype):
    mzs, ints, coords = make_spectrum_set()
    write_imzml(str(tmp_path / 'ds.imzML'), mzs, ints, coords, mode=mode, mz_dtype=mz_dtype)
    reader = FSImzMLReader(tmp_path)

    actual = {
        'xs': reader.xs.tolist(),
        'ys': reader.ys.tolist(),
        'shape': [int(reader.h), int(reader.w)],
        'mask': reader.mask.astype(int).tolist(),
        'mz_precision': reader.mz_precision,
        'spectra': {},
    }
    for idx, sp_mzs, sp_ints in reader.iter_spectra(range(reader.n_spectra)):
        actual['spectra'][f'sp{idx}'] = {'mzs': sp_mzs.tolist(), 'ints': sp_ints.tolist()}

    assert len(actual['spectra']['sp0']['mzs']) < len(mzs[0])
    assert all(v > 0 for v in actual['spectra']['sp0']['ints'])
    check_ref(f'imzml/{mode}_{mz_dtype.__name__}', actual, partial(assert_tree, tol=None))
