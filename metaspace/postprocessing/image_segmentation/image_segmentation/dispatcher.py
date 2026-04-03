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

    if algorithm not in ALGORITHM_REGISTRY:
        raise ValueError(
            f"Unknown algorithm '{algorithm}'. "
            f"Available algorithms: {list(ALGORITHM_REGISTRY.keys())}"
        )

    algo = ALGORITHM_REGISTRY[algorithm]

    logger.info(
        f"Dataset {segmentation_input.dataset_id}: "
        f"dispatching to algorithm '{algorithm}'"
    )

    # validate_parameters fills defaults and raises on bad inputs
    param_validation_start = time.time()
    validated_parameters = algo.validate_parameters(parameters)
    param_validation_time = time.time() - param_validation_start
    logger.info(f'[SEGMENTATION_PERF] Parameter validation completed in {param_validation_time:.3f}s for {algorithm}')

    algorithm_start_time = time.time()
    result = algo.run(
        segmentation_input=segmentation_input,
        parameters=validated_parameters,
    )
    algorithm_time = time.time() - algorithm_start_time
    logger.info(f'[SEGMENTATION_PERF] Algorithm {algorithm} execution completed in {algorithm_time:.3f}s')
    
    return result