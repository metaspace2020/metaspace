from functools import partial

import numpy as np
import pytest
from scipy.sparse import coo_matrix

from sm.engine.annotation.metrics import mass_metrics
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_image_cases
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency


def _metrics(case, images=None, mz_images=None):
    mz_mean, mz_stddev, err_abs, err_rel = mass_metrics(
        images or case.images, mz_images or case.mz_images, case.theo_mzs, case.theo_ints
    )
    return {
        'mz_mean': [float(v) for v in mz_mean],
        'mz_stddev': [float(v) for v in mz_stddev],
        'mz_err_abs': float(err_abs),
        'mz_err_rel': float(err_rel),
    }


def test_mass_metrics_match_reference():
    actual = {case.name: _metrics(case) for case in make_image_cases()}
    assert any(v['mz_stddev'][0] > 0 for v in actual.values())
    check_ref('mz_errors/v1', actual, partial(assert_tree, tol='MASS_ERR'))


def _shuffled(images, mz_images, rng):
    out_images, out_mz = [], []
    for img, mz_img in zip(images, mz_images):
        order = rng.permutation(img.nnz)
        out_images.append(
            coo_matrix((img.data[order], (img.row[order], img.col[order])), img.shape)
        )
        out_mz.append(
            coo_matrix((mz_img.data[order], (mz_img.row[order], mz_img.col[order])), mz_img.shape)
        )
    return out_images, out_mz


def test_mass_metrics_pixel_order_invariant():
    rng = np.random.default_rng(0)
    for case in make_image_cases():
        images, mz_images = _shuffled(case.images, case.mz_images, rng)
        assert_tree(_metrics(case, images, mz_images), _metrics(case), 'MASS_ERR', case.name)
