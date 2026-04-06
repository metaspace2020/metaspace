"""Normalize intensities (TIC, log, z-score) and build ``SegmentationInput``."""

from __future__ import annotations

import logging
from typing import List, Tuple

import numpy as np

from .types import SegmentationInput

logger = logging.getLogger(__name__)


def normalize_tic(
    matrix: np.ndarray,
) -> np.ndarray:
    """Divide each pixel row by its sum (pixels with zero sum are unchanged)."""
    pixel_totals = matrix.sum(axis=1, keepdims=True)  # (n_pixels, 1)
    nonzero_mask = pixel_totals[:, 0] > 0
    matrix = matrix.copy()
    matrix[nonzero_mask] = matrix[nonzero_mask] / pixel_totals[nonzero_mask]

    n_zero = (~nonzero_mask).sum()
    if n_zero > 0:
        logger.warning(
            "TIC normalization: %s pixels had zero total intensity and were left as zero",
            n_zero,
        )

    return matrix


def log_transform(
    matrix: np.ndarray,
) -> np.ndarray:
    """Apply ``log1p`` element-wise; values must be non-negative."""
    if (matrix < 0).any():
        raise ValueError("Log transform received negative values in intensity matrix")

    return np.log1p(matrix)


def normalize_zscore(
    matrix: np.ndarray,
) -> np.ndarray:
    """Z-score each ion column; zero-variance columns become all zeros."""
    matrix = matrix.copy()
    means = matrix.mean(axis=0)  # (n_ions,)
    stds = matrix.std(axis=0)  # (n_ions,)

    nonzero_std = stds > 0
    matrix[:, nonzero_std] = (matrix[:, nonzero_std] - means[nonzero_std]) / stds[nonzero_std]
    matrix[:, ~nonzero_std] = 0.0

    n_zero_std = (~nonzero_std).sum()
    if n_zero_std > 0:
        logger.warning(
            "Z-score normalization: %s ions had zero std and were zeroed out — "
            "consider removing them via variance filtering",
            n_zero_std,
        )

    return matrix


def preprocess(  # pylint: disable=too-many-arguments
    intensity_matrix: np.ndarray,
    pixel_coordinates: np.ndarray,
    ion_labels: List[str],
    image_shape: Tuple[int, int],
    dataset_id: str,
    use_tic: bool = True,
) -> SegmentationInput:
    """Run TIC (optional), log, and z-score steps; return a ``SegmentationInput``."""
    logger.info(
        "Dataset %s: preprocessing matrix %s pixels x %s ions",
        dataset_id,
        intensity_matrix.shape[0],
        intensity_matrix.shape[1],
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
