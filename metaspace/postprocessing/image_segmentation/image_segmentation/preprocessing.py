from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import numpy as np

from .types import SegmentationInput

logger = logging.getLogger(__name__)


def normalize_tic(
    matrix: np.ndarray,
) -> np.ndarray:

    pixel_totals = matrix.sum(axis=1, keepdims=True)    # (n_pixels, 1)
    nonzero_mask = pixel_totals[:, 0] > 0
    matrix = matrix.copy()
    matrix[nonzero_mask] = matrix[nonzero_mask] / pixel_totals[nonzero_mask]

    n_zero = (~nonzero_mask).sum()
    if n_zero > 0:
        logger.warning(
            f"TIC normalization: {n_zero} pixels had zero total intensity "
            f"and were left as zero"
        )

    return matrix


def log_transform(
    matrix: np.ndarray,
) -> np.ndarray:
    if (matrix < 0).any():
        raise ValueError("Log transform received negative values in intensity matrix")

    return np.log1p(matrix)


def normalize_zscore(
    matrix: np.ndarray,
) -> np.ndarray:
    matrix = matrix.copy()
    means = matrix.mean(axis=0)     # (n_ions,)
    stds = matrix.std(axis=0)       # (n_ions,)

    nonzero_std = stds > 0
    matrix[:, nonzero_std] = (
        matrix[:, nonzero_std] - means[nonzero_std]
    ) / stds[nonzero_std]
    matrix[:, ~nonzero_std] = 0.0

    n_zero_std = (~nonzero_std).sum()
    if n_zero_std > 0:
        logger.warning(
            f"Z-score normalization: {n_zero_std} ions had zero std and were zeroed out — "
            f"consider removing them via variance filtering"
        )

    return matrix

def preprocess(
    intensity_matrix: np.ndarray,
    pixel_coordinates: np.ndarray,
    ion_labels: List[str],
    image_shape: Tuple[int, int],
    dataset_id: str,
    use_tic: bool = True,
) -> SegmentationInput:

    logger.info(
        f"Dataset {dataset_id}: preprocessing matrix "
        f"{intensity_matrix.shape[0]} pixels x {intensity_matrix.shape[1]} ions"
    )

    matrix = intensity_matrix.copy()

    # 1. TIC normalization — skip if already applied at load time
    if not use_tic:
        matrix = normalize_tic(matrix)
    else:
        logger.info("Skipping TIC normalization — already applied at load time")

    # 2. Log transform
    matrix = log_transform(matrix)

    # 3. Z-score normalization
    matrix = normalize_zscore(matrix)

    return SegmentationInput(
        intensity_matrix=matrix,
        pixel_coordinates=pixel_coordinates,
        ion_labels=ion_labels,
        image_shape=image_shape,
        dataset_id=dataset_id,
    )