# This file is currently unused - it's needed for the v2_chaos metric, which hasn't yet been
# adopted/rejected as we ran out of time for evaluation.
import numba  # pylint: disable=import-error  # numba is big and excluded from the main build
import numpy as np


@numba.njit(numba.int32(numba.boolean[:, :]))
def count_connected_components(mask: np.ndarray):
    # GCOVR_EXCL_START  # Disable code coverage for this function as it's not prod code
    """
    Python-based reimplementation of:
        https://github.com/alexandrovteam/ims-cpp/blob/dcc12b4c50dbfdcde3f765af85fb8b3bb5cd7ec3/ims/image_measures.cpp#L89

    with an optimization to only need to keep 2 rows of labels in memory at a time
    """
    h, w = mask.shape
    parent = [0]

    def find_root(i):
        while parent[i] < i:
            i = parent[i]
        return i

    def set_root(i, root):
        while parent[i] < i:
            i, parent[i] = parent[i], root

    def merge_labels(i, j):
        root = find_root(i)
        if i != j:
            root = min(root, find_root(j))
            set_root(j, root)
        set_root(i, root)
        return root

    # Optimization: only keep labels for the current and previous row, as the rest of the image
    # isn't needed
    last_labels = np.empty(w, dtype='i4')
    row_labels = np.zeros(w, dtype='i4')
    for y in range(h):
        last_labels, row_labels = row_labels, last_labels
        for x in range(w):
            if not mask[y, x]:
                continue
            left = x > 0 and mask[y, x - 1]
            up = y > 0 and mask[y - 1, x]
            if up and left:
                row_labels[x] = merge_labels(last_labels[x], row_labels[x - 1])
            elif up:
                row_labels[x] = last_labels[x]
            elif left:
                row_labels[x] = row_labels[x - 1]
            else:
                row_labels[x] = len(parent)
                parent.append(len(parent))

    n_components = 0
    for i in range(1, len(parent)):
        if parent[i] < i:
            parent[i] = parent[parent[i]]
        else:
            n_components += 1
            parent[i] = n_components

    return n_components
    # GCOVR_EXCL_STOP


def downsample_fast(img):
    # GCOVR_EXCL_START  # Disable code coverage for this function as it's not prod code
    """Fast halving of resolution of both axes by averaging 2x2 pixel groups.
    Equivalent to skimage.transform.downscale_local_mean(img, (2,2)) but runs in 1/10th of the time.
    Supports stacked images - Only the last 2 dimensions are rescaled.
    """
    h, w = img.shape[-2:]
    half_w = img[..., :, ::2].copy()
    if w & 1 == 1:
        half_w[..., :, :-1] += img[..., :, 1::2]
    else:
        half_w += img[..., :, 1::2]

    half_h = half_w[..., ::2, :]
    if h & 1 == 1:
        half_h[..., :-1, :] += half_w[..., 1::2, :]
    else:
        half_h += half_w[..., 1::2, :]

    return half_h * 0.25
    # GCOVR_EXCL_STOP
