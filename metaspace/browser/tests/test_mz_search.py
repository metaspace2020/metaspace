from sm.browser.mz_search import create_mz_image

import numpy as np


def test_create_mz_image():
    mz_peaks = np.array([[100, 1000, 0], [100, 1000, 1], [100, 1000, 2], [100, 1000, 2]])
    coordinates = np.array([[0, 0], [1, 0], [2, 0]])

    mz_image, alpha = create_mz_image(mz_peaks, coordinates)

    assert alpha.tolist() == [[1.0, 1.0, 1.0]]
    assert mz_image.tolist() == [[0.5, 0.5, 1]]
