from io import BytesIO

import numpy as np
import png
import pytest

from sm.engine.annotation.png_generator import PngGenerator
from tests.consistency.refs import check_ref
from tests.consistency.tolerances import assert_exact, assert_img_sim

pytestmark = pytest.mark.consistency


def _decode(data):
    width, height, rows, info = png.Reader(bytes=data).read()
    planes = np.vstack([np.array(row) for row in rows]).reshape(height, width, info['planes'])
    return planes


def test_png_matches_reference():
    greyscale = True
    rng = np.random.default_rng(0)
    array = rng.random((20, 25)) * 1000.0
    mask = (rng.random((20, 25)) > 0.15).astype(float)
    planes = _decode(PngGenerator(mask, greyscale=greyscale).generate_png(array))
    assert (planes[:, :, -1] == 0).any()
    actual = {'alpha': planes[:, :, -1], 'values': planes[:, :, :-1]}

    def compare(actual, expected):
        assert_exact(actual['alpha'], expected['alpha'], 'alpha')
        expected_values = np.array(expected['values'])
        for channel in range(expected_values.shape[2]):
            assert_img_sim(
                actual['values'][:, :, channel], expected_values[:, :, channel], f'channel{channel}'
            )

    check_ref('png/grey1', actual, compare)
