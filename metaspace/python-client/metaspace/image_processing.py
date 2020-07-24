from typing import List, overload

import numpy as np
import pandas as pd


def clip_hotspots(img: np.ndarray):
    """
    Performs hotspot removal on an ion image to match the METASPACE website's ion image rendering
    """
    min_visible = np.max(img) / 256
    if min_visible > 0:
        hotspot_threshold = np.quantile(img[img > min_visible], 0.99)
        return np.clip(img, None, hotspot_threshold)
    else:
        return img


def colocalization(img_a: np.ndarray, img_b: np.ndarray):
    """
    Calculates degree of colocalization between two ion images, using the same algorithm METASPACE uses.
    Returns a float between 0 (no colocalization) and 1 (full colocalization).

    Citation: Ovchinnikova et al. (2020) ColocML. https://doi.org/10.1093/bioinformatics/btaa085

    Requires additional packages to be installed: scipy, scikit-learn
    """
    from scipy.ndimage import median_filter
    from sklearn.metrics.pairwise import cosine_similarity

    h, w = img_a.shape

    def preprocess(img):
        img = img.copy().reshape((h, w))
        img[img < np.quantile(img, 0.5)] = 0
        return median_filter(img, (3, 3)).reshape([1, h * w])

    return cosine_similarity(preprocess(img_a), preprocess(img_b))[0, 0]


@overload
def colocalization_matrix(images: List[np.ndarray], labels: None = None) -> np.ndarray:
    ...


@overload
def colocalization_matrix(images: List[np.ndarray], labels: List[str]) -> pd.DataFrame:
    ...


def colocalization_matrix(images: List[np.ndarray], labels=None):
    """
    Calculates level of colocalization between all pairs of images in a list of ion images.
    If many checks are needed, it is usually faster to generate the entire matrix than to do
    many separate calls to "colocalization".

    Citation: Ovchinnikova et al. (2020) ColocML. https://doi.org/10.1093/bioinformatics/btaa085

    Requires additional packages to be installed: scipy, scikit-learn

    :param images: A list of ion images
    :param labels: If supplied, output will be a pandas DataFrame where the labels are used to define
                   the index and columns. It can be useful to pass ion formulas
                   or (formula, adduct) pairs here, to facilitate easy lookup of colocalization values
                   If not supplied, the output will be a numpy ndarray
    :return:
    """
    from scipy.ndimage import median_filter
    from sklearn.metrics.pairwise import pairwise_kernels

    count = len(images)
    if count == 0:
        similarity_matrix = np.ones((0, 0))
    elif count == 1:
        similarity_matrix = np.ones((1, 1))
    else:
        h, w = images[0].shape
        flat_images = np.vstack([i.flatten() for i in images])
        flat_images[flat_images < np.quantile(flat_images, 0.5, axis=1, keepdims=True)] = 0
        filtered_images = median_filter(flat_images.reshape((count, h, w)), (1, 3, 3)).reshape(
            (count, h * w)
        )
        similarity_matrix = pairwise_kernels(filtered_images, metric='cosine')

    if labels is None:
        return similarity_matrix
    else:
        return pd.DataFrame(similarity_matrix, index=labels, columns=labels)
