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
    logger.info("[SEGMENTATION_PERF] Pipeline started for dataset %s", dataset_id)
    logger.info(
        "Dataset %s: starting segmentation (algorithm=%s, fdr=%s)",
        dataset_id,
        algorithm,
        fdr,
    )

    # 1. Load
    load_start_time = time.time()
    logger.info(
        "Dataset %s: loading input from S3 key '%s'",
        dataset_id,
        input_s3_key,
    )
    (
        intensity_matrix,
        pixel_coordinates,
        ion_labels,
        image_shape,
    ) = load_segmentation_input_from_s3(s3_key=input_s3_key)

    load_time = time.time() - load_start_time
    logger.info(
        "[SEGMENTATION_PERF] Data loading completed in %.3fs for dataset %s",
        load_time,
        dataset_id,
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
        "[SEGMENTATION_PERF] Preprocessing completed in %.3fs for dataset %s",
        preprocess_time,
        dataset_id,
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
        "[SEGMENTATION_PERF] Algorithm dispatch (%s) completed in %.3fs for dataset %s",
        algorithm,
        dispatch_time,
        dataset_id,
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
        "[SEGMENTATION_PERF] Postprocessing completed in %.3fs for dataset %s",
        postprocess_time,
        dataset_id,
    )
    logger.info(
        "[SEGMENTATION_PERF] Total pipeline time: %.3fs for dataset %s",
        total_pipeline_time,
        dataset_id,
    )
    logger.info(
        "[SEGMENTATION_PERF] Pipeline breakdown - Load: %.3fs, Preprocess: %.3fs, "
        "Dispatch: %.3fs, Postprocess: %.3fs",
        load_time,
        preprocess_time,
        dispatch_time,
        postprocess_time,
    )

    logger.info(
        "Dataset %s: segmentation complete (n_segments=%s)",
        dataset_id,
        result.n_segments,
    )

    return result
