"""Route segmentation requests to registered algorithms and log timing."""

from __future__ import annotations

import logging
import time
from typing import Dict

from .algorithms.base import BaseSegmentationAlgorithm
from .algorithms.pca_gmm import PCAGMMAlgorithm
from .types import RawAlgorithmOutput, SegmentationInput

logger = logging.getLogger(__name__)


# --- Registry ---

ALGORITHM_REGISTRY: Dict[str, BaseSegmentationAlgorithm] = {
    "pca_gmm": PCAGMMAlgorithm(),
}


def dispatch(
    segmentation_input: SegmentationInput,
    algorithm: str,
    parameters: dict,
) -> RawAlgorithmOutput:
    """Validate parameters and run the named algorithm on ``segmentation_input``.

    Args:
        segmentation_input: Preprocessed input for the job.
        algorithm: Registry key (e.g. ``pca_gmm``).
        parameters: Algorithm-specific parameters; defaults filled by ``validate_parameters``.

    Returns:
        Raw algorithm output.

    Raises:
        ValueError: If ``algorithm`` is not registered.
    """
    if algorithm not in ALGORITHM_REGISTRY:
        raise ValueError(
            f"Unknown algorithm '{algorithm}'. "
            f"Available algorithms: {list(ALGORITHM_REGISTRY.keys())}"
        )

    algo = ALGORITHM_REGISTRY[algorithm]

    logger.info(
        "Dataset %s: dispatching to algorithm '%s'",
        segmentation_input.dataset_id,
        algorithm,
    )

    # validate_parameters fills defaults and raises on bad inputs
    param_validation_start = time.time()
    validated_parameters = algo.validate_parameters(parameters)
    param_validation_time = time.time() - param_validation_start
    logger.info(
        "[SEGMENTATION_PERF] Parameter validation completed in %.3fs for %s",
        param_validation_time,
        algorithm,
    )

    algorithm_start_time = time.time()
    result = algo.run(
        segmentation_input=segmentation_input,
        parameters=validated_parameters,
    )
    algorithm_time = time.time() - algorithm_start_time
    logger.info(
        "[SEGMENTATION_PERF] Algorithm %s execution completed in %.3fs",
        algorithm,
        algorithm_time,
    )

    return result
