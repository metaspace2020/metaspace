import numpy as np
from numpy.testing import assert_almost_equal, assert_equal
from png import Reader

from sm.engine.annotation.png_generator import PngGenerator


def test_png_gen_greyscale_works():
    alpha_ch = np.array([[1, 1, 1]])
    gen = PngGenerator(alpha_ch, greyscale=True)

    img_data = np.array([[0.0, 5.0, 10.0]])
    norm_img_data = (img_data - img_data.min()) / (img_data.max() - img_data.min())
    img_bytes = gen.generate_png(img_data)

    reader = Reader(bytes=img_bytes)
    width, height, pixels, _ = reader.asFloat()
    assert_equal(width, 3)
    assert_equal(height, 1)

    grey_shape = img_data.shape + (2,)
    assert_almost_equal(
        np.array(list(pixels)).reshape(grey_shape)[:, :, 0], norm_img_data, decimal=4
    )
