"""End-to-end segmentation: load from S3, preprocess, dispatch algorithm, postprocess."""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

from image_segmentation.dispatcher import dispatch
from image_segmentation.loader import load_segmentation_input_from_s3
from image_segmentation.postprocessing import postprocess
from image_segmentation.preprocessing import preprocess
from image_segmentation.types import SegmentationResult

logger = logging.getLogger(__name__)


def run_segmentation(  # pylint: disable=too-many-arguments,too-many-locals
    dataset_id: str,
    algorithm: str,
    input_s3_key: str,
    parameters: Optional[Dict] = None,
    fdr: float = 0.1,
    ion_labels: Optional[List[str]] = None,
    use_tic: bool = True,
    smoothing: bool = True,
    window_size: int = 3,
) -> SegmentationResult:
    """Run the segmentation pipeline, loading input arrays from S3."""
    if parameters is None:
        parameters = {}

    pipeline_start_time = time.time()
    logger.info(f"[SEGMENTATION_PERF] Pipeline started for dataset {dataset_id}")
    logger.info(f"Dataset {dataset_id}: starting segmentation (algorithm={algorithm}, fdr={fdr})")

    # 1. Load
    load_start_time = time.time()
    logger.info(f"Dataset {dataset_id}: loading input from S3 key '{input_s3_key}'")
    (
        intensity_matrix,
        pixel_coordinates,
        ion_labels,
        image_shape,
    ) = load_segmentation_input_from_s3(s3_key=input_s3_key)

    load_time = time.time() - load_start_time
    logger.info(
        f"[SEGMENTATION_PERF] Data loading completed in {load_time:.3f}s for dataset {dataset_id}"
    )

    # 2. Preprocess
    preprocess_start_time = time.time()
    segmentation_input = preprocess(
        intensity_matrix=intensity_matrix,
        pixel_coordinates=pixel_coordinates,
        ion_labels=ion_labels,
        image_shape=image_shape,
        dataset_id=dataset_id,
        use_tic=use_tic,
    )
    preprocess_time = time.time() - preprocess_start_time
    logger.info(
        f"[SEGMENTATION_PERF] Preprocessing completed in {preprocess_time:.3f}s "
        f"for dataset {dataset_id}"
    )

    # 3. Dispatch
    dispatch_start_time = time.time()
    raw_output = dispatch(
        segmentation_input=segmentation_input,
        algorithm=algorithm,
        parameters=parameters,
    )
    dispatch_time = time.time() - dispatch_start_time
    logger.info(
        f"[SEGMENTATION_PERF] Algorithm dispatch ({algorithm}) completed in "
        f"{dispatch_time:.3f}s for dataset {dataset_id}"
    )

    # 4. Postprocess
    postprocess_start_time = time.time()
    result = postprocess(
        raw_output=raw_output,
        segmentation_input=segmentation_input,
        raw_intensity_matrix=intensity_matrix,
        smoothing=smoothing,
        window_size=window_size,
    )
    postprocess_time = time.time() - postprocess_start_time

    total_pipeline_time = time.time() - pipeline_start_time
    logger.info(
        f"[SEGMENTATION_PERF] Postprocessing completed in {postprocess_time:.3f}s "
        f"for dataset {dataset_id}"
    )
    logger.info(
        f"[SEGMENTATION_PERF] Total pipeline time: {total_pipeline_time:.3f}s "
        f"for dataset {dataset_id}"
    )
    logger.info(
        f"[SEGMENTATION_PERF] Pipeline breakdown - Load: {load_time:.3f}s, "
        f"Preprocess: {preprocess_time:.3f}s, Dispatch: {dispatch_time:.3f}s, "
        f"Postprocess: {postprocess_time:.3f}s"
    )

    logger.info(f"Dataset {dataset_id}: segmentation complete (n_segments={result.n_segments})")

    return result
