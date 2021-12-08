from typing import List, Optional

import numba
import numpy as np
from scipy.sparse import coo_matrix


def chaos_dilate(arr):
    """NOTE: This mutates the input. It's equivalent to
    scipy.ndimage.binary_dilation(arr, iterations=2), but it's about 10x faster.
    It dilates a mask such that the masked image will get the same measure of chaos score,
    as measure-of-chaos does its own dilation on the image which can cause connected regions
    to merge if gaps in the image are made too small.
    """
    arr[1:] |= arr[:-1]
    arr[1:] |= arr[:-1]
    arr[:-2] |= arr[2:]
    return arr


def bool_aligned_dilate(arr, res=1):
    if res == 1:
        return arr
    count = int(np.ceil(len(arr) / res))
    downsampled = (
        np.pad(arr, (0, count * res - len(arr))).reshape((count, res)).any(axis=1, keepdims=True)
    )
    upsampled = np.broadcast_to(downsampled, (count, res)).reshape(-1)[: len(arr)]
    return upsampled


def compact_empty_space(img):
    img = img[chaos_dilate(np.any(img, axis=1)), :]
    img = img[:, chaos_dilate(np.any(img, axis=0))]
    return img


def crop_images(imgs: List[coo_matrix], ds_row_mask: np.ndarray, ds_col_mask: np.ndarray):
    nrows, ncols = next((img.shape for img in imgs), (1, 1))
    if not any(img.nnz > 0 for img in imgs):
        # Return a 1,1 image to avoid downstream errors
        return [coo_matrix(([], ([], [])), shape=(1, 1)) for _ in imgs], np.ones(1), np.ones(1)

    # This includes 2px padding on each side, as measure-of-chaos changes if all padding is removed
    row_lo = max(min(img.row.min(initial=0) for img in imgs) - 2, 0)
    row_hi = min(max(img.row.max(initial=0) for img in imgs) + 3, nrows)
    row_cnt = row_hi - row_lo
    col_lo = max(min(img.col.min(initial=0) for img in imgs) - 2, 0)
    col_hi = min(max(img.col.max(initial=0) for img in imgs) + 3, ncols)
    col_cnt = col_hi - col_lo

    if row_cnt < nrows or col_cnt < ncols:
        # Some rows can be cropped
        cropped_imgs = [
            coo_matrix((img.data, (img.row - row_lo, img.col - col_lo)), shape=(row_cnt, col_cnt))
            if img is not None
            else None
            for img in imgs
        ]

        return cropped_imgs, ds_row_mask[row_lo:row_hi], ds_col_mask[col_lo:col_hi]
    else:
        return imgs, ds_row_mask, ds_col_mask


def pack_images(
    imgs: List[coo_matrix], ds_row_mask: np.ndarray, ds_col_mask: np.ndarray, min_res: int
):
    nrows, ncols = next((img.shape for img in imgs), (1, 1))

    approx_occupancy = np.max([img.nnz for img in imgs], initial=0)
    if approx_occupancy < nrows * ncols * 0.05:
        # Sparse - find empty rows/cols to exclude
        row_mask = np.zeros(nrows, dtype=np.bool)
        col_mask = np.zeros(ncols, dtype=np.bool)
        for i, img in enumerate(imgs):
            row_mask[img.row] = True
            col_mask[img.col] = True
            # First image is also used for measure-of-chaos, so dilate the mask to prevent
            # disconnected regions from being merged.
            if i == 0:
                chaos_dilate(row_mask)
                chaos_dilate(col_mask)

        # Dilate the masks so that downsampled images aren't affected by the empty space removal
        row_mask = bool_aligned_dilate(row_mask, min_res)
        col_mask = bool_aligned_dilate(col_mask, min_res)
    else:
        # Dense - use the precalculated masks
        row_mask = ds_row_mask
        col_mask = ds_col_mask

    if np.count_nonzero(row_mask) * np.count_nonzero(col_mask) < nrows * ncols * 0.8:
        # Remove empty rows/cols to save time
        row_idxs = np.nonzero(row_mask)[0]
        col_idxs = np.nonzero(col_mask)[0]
        # Using 99999 as an unused index, so a broken mapping causes an error to be thrown
        row_to_compact_row = np.full(nrows, 99999, dtype='i')
        row_to_compact_row[row_idxs] = np.arange(len(row_idxs))
        col_to_compact_col = np.full(ncols, 99999, dtype='i')
        col_to_compact_col[col_idxs] = np.arange(len(col_idxs))

        return [
            coo_matrix(
                (img.data, (row_to_compact_row[img.row], col_to_compact_col[img.col])),
                shape=(len(row_idxs), len(col_idxs)),
            )
            for img in imgs
        ]
    else:
        # No time can be saved, don't compact the images
        return imgs


def convert_images_to_dense(
    imgs: List[Optional[coo_matrix]], ds_row_mask: np.ndarray, ds_col_mask: np.ndarray, min_res: int
) -> np.ndarray:
    nonnull_idxs = np.nonzero([img is not None for img in imgs])[0]
    nonnull_imgs = [imgs[idx] for idx in nonnull_idxs]

    cropped_imgs, ds_row_mask, ds_col_mask = crop_images(nonnull_imgs, ds_row_mask, ds_col_mask)
    packed_imgs = pack_images(cropped_imgs, ds_row_mask, ds_col_mask, min_res)

    dense_imgs = [None for img in imgs]

    for idx, packed_img in zip(nonnull_idxs, packed_imgs):
        dense_imgs[idx] = packed_img.toarray()

    if any(img is None for img in dense_imgs):
        packed_shape = next((img.shape for img in packed_imgs if img is not None), (0, 0))
        empty_img = np.zeros(packed_shape, dtype='f')
        for i in range(len(dense_imgs)):
            if dense_imgs[i] is None:
                dense_imgs[i] = empty_img

    return np.array(dense_imgs)


@numba.njit(numba.int32(numba.boolean[:, :]))
def count_connected_components(mask: np.ndarray):
    h, w = mask.shape
    parent = [0]

    def find_root(i):
        while parent[i] < i:
            i = parent[i]
        return i

    def set_root(i, r):
        while parent[i] < i:
            i, parent[i] = parent[i], r

    def merge_labels(i, j):
        r = find_root(i)
        if i != j:
            r = min(r, find_root(j))
            set_root(j, r)
        set_root(i, r)
        return r

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


def downsample_fast(img):
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
