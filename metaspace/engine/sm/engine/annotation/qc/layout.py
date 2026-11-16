from typing import Any, Dict, List

import numpy as np
from scipy import ndimage
from scipy.spatial.qhull import ConvexHull, QhullError  # pylint: disable=no-name-in-module

EIGHT_CONNECTED = np.ones((3, 3), dtype=bool)
MAX_COMPONENTS_DETAILED = 20


def _hull_area(mask: np.ndarray) -> float:
    rows, cols = np.nonzero(mask)
    order = np.lexsort((cols, rows))
    rows, cols = rows[order], cols[order]
    first = np.r_[True, rows[1:] != rows[:-1]]
    last = np.r_[rows[1:] != rows[:-1], True]
    keep = first | last
    hull_rows, hull_cols = rows[keep], cols[keep]
    corners = np.concatenate(
        [
            np.stack([hull_rows + dr, hull_cols + dc], axis=1)
            for dr in (-0.5, 0.5)
            for dc in (-0.5, 0.5)
        ]
    )
    try:
        return float(ConvexHull(corners).volume)
    except QhullError:
        return float(mask.sum())


def _component_gaps(labels: np.ndarray, sizes: np.ndarray) -> List[float]:
    if len(sizes) < 2:
        return []
    largest = int(np.argmax(sizes)) + 1
    dist = ndimage.distance_transform_edt(labels != largest)
    return [float(dist[labels == lab].min()) for lab in range(1, len(sizes) + 1) if lab != largest]


def analyze_layout(  # pylint: disable=too-many-locals
    x: np.ndarray, y: np.ndarray, tiny_size: int = 10, max_dense_cells: int = 20_000_000
) -> Dict[str, Any]:
    """Describe the acquired pixel layout from 1-based integer coordinates.

    Only counts and the bounding box are computed when the bounding box exceeds
    ``max_dense_cells``, to keep the analysis itself cheap.
    """
    x, y = np.asarray(x), np.asarray(y)
    n = int(len(x))
    result: Dict[str, Any] = {'n_spectra': n}
    if n == 0:
        result.update(n_unique=0, n_duplicates=0, n_invalid=0, analysed=False)
        return result

    finite = np.isfinite(x) & np.isfinite(y)
    valid = finite & (x >= 1) & (y >= 1)
    result['n_invalid'] = int(n - valid.sum())
    xs, ys = x[valid].astype(np.int64), y[valid].astype(np.int64)
    if len(xs) == 0:
        result.update(n_unique=0, n_duplicates=0, analysed=False)
        return result

    pairs = np.unique(np.stack([xs, ys], axis=1), axis=0)
    n_unique = int(len(pairs))
    width, height = int(xs.max()), int(ys.max())
    dense_size = width * height
    result.update(
        n_unique=n_unique,
        n_duplicates=int(len(xs) - n_unique),
        width=width,
        height=height,
        dense_size=dense_size,
        fill_fraction=n_unique / dense_size,
        analysed=dense_size <= max_dense_cells,
    )
    if not result['analysed']:
        return result

    mask = np.zeros((height, width), dtype=bool)
    mask[pairs[:, 1] - 1, pairs[:, 0] - 1] = True
    result['empty_columns'] = int(width - mask.any(axis=0).sum())
    result['empty_rows'] = int(height - mask.any(axis=1).sum())

    labels, n_comp = ndimage.label(mask, structure=EIGHT_CONNECTED)
    sizes = np.bincount(labels.ravel())[1:]
    result.update(
        n_components=int(n_comp),
        largest_component_share=float(sizes.max() / n_unique),
        component_sizes=sorted(sizes.tolist(), reverse=True)[:MAX_COMPONENTS_DETAILED],
        n_tiny_components=int((sizes < tiny_size).sum()),
        n_components_after_dilation=int(
            ndimage.label(ndimage.binary_dilation(mask, structure=EIGHT_CONNECTED))[1]
        ),
        gaps_to_largest=sorted(_component_gaps(labels, sizes))[:MAX_COMPONENTS_DETAILED],
    )

    top = np.argsort(sizes)[::-1][:MAX_COMPONENTS_DETAILED]
    compactness = []
    for idx in top:
        comp = labels == idx + 1
        compactness.append(float(sizes[idx] / max(_hull_area(comp), 1.0)))
    result['compactness'] = compactness
    return result
