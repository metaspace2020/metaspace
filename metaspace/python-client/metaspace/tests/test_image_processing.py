import pytest
import numpy as np
import pandas as pd

from metaspace.image_processing import clip_hotspots, colocalization, colocalization_matrix

IMG_A = np.array([[1, 1, 0, 0], [1, 1, 0, 0], [1, 1, 0, 0], [1, 1, 0, 0]])
IMG_B = np.array([[1, 1, 1, 1], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]])
IMG_C = np.array([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 1], [0, 0, 1, 1]])
COLOC_A_B = 0.5


def test_clip_hotspots():
    # First 99 pixels are "effectively empty" (less than 1/256th of the max)
    # and shouldn't count towards the thresholds
    # Second half of the image is a gradient from 100 to 200, meaning the hotspot threshold
    # should be 199 and the last pixel should be clipped
    img = np.concatenate([np.ones(99) * 0.5, np.arange(100, 201)]).reshape(20, 10)
    clipped = clip_hotspots(img)
    assert img.shape == clipped.shape
    assert np.isclose(clipped.flat[:199], img.flat[:199]).all()
    assert clipped.flat[199] == 199


def test_colocalization():
    assert np.isclose(colocalization(IMG_A, IMG_A), 1)
    assert np.isclose(colocalization(IMG_A, IMG_B), COLOC_A_B)
    assert np.isclose(colocalization(IMG_B, IMG_A), COLOC_A_B)
    assert np.isclose(colocalization(IMG_A, IMG_C), 0)


def test_colocalization_matrix():
    IMGS = [IMG_A, IMG_B, IMG_C]
    LABELS = ['a', 'b', 'c']
    EXPECTED = [[1, COLOC_A_B, 0], [COLOC_A_B, 1, 0], [0, 0, 1]]
    mat = colocalization_matrix(IMGS)
    assert isinstance(mat, np.ndarray)
    assert np.isclose(mat, EXPECTED).all()

    df = colocalization_matrix(IMGS, labels=LABELS)
    expected_df = pd.DataFrame(EXPECTED, index=LABELS, columns=LABELS, dtype='d')
    pd.testing.assert_frame_equal(df, expected_df)
