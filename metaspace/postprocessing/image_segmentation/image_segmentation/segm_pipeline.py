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
    database_ids: Optional[List[int]] = None,
    parameters: Optional[Dict] = None,
    fdr: float = 0.1,
    adducts: Optional[List[str]] = None,
    min_mz: Optional[float] = None,
    max_mz: Optional[float] = None,
    ion_labels: Optional[List[str]] = None,
    use_tic: bool = False,
    off_sample: Optional[bool] = False,
    smoothing: bool = True,
    window_size: int = 3,
    input_s3_key: Optional[str] = None,
) -> SegmentationResult:
    """Run the segmentation pipeline.

    Loading priority:
      1. input_s3_key provided  → load pre-built arrays from S3 (engine path, default)
      2. databases provided      → fetch via the METASPACE Python client (fallback)
    """
    if parameters is None:
        parameters = {}

    # Kept for API parity with the engine / future client loader path.
    _ = (adducts, min_mz, max_mz, off_sample)

    pipeline_start_time = time.time()
    logger.info("[SEGMENTATION_PERF] Pipeline started for dataset %s", dataset_id)
    logger.info(
        "Dataset %s: starting segmentation (algorithm=%s, fdr=%s)",
        dataset_id,
        algorithm,
        fdr,
    )

    # 1. Load — prefer S3 pre-built input, fall back to Python client
    load_start_time = time.time()
    if input_s3_key is not None:
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
    else:
        if not database_ids:
            raise ValueError(
                f"Dataset {dataset_id}: either 'input_s3_key' or 'database_ids' must be provided"
            )
        logger.info(
            "Dataset %s: loading input via Python client (database_ids=%s)",
            dataset_id,
            database_ids,
        )
        # from image_segmentation.loader import load_segmentation_input
        # intensity_matrix, pixel_coordinates, ion_labels, image_shape = load_segmentation_input(
        #     dataset_id=dataset_id,
        #     database_ids=database_ids,
        #     fdr=fdr,
        #     adducts=adducts,
        #     min_mz=min_mz,
        #     max_mz=max_mz,
        #     ion_labels=ion_labels,
        #     use_tic=use_tic,
        #     off_sample=off_sample,
        # )

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


# python 3.9+
# def run_segmentation_from_anndata(
#     adata,
#     dataset_id: str,
#     algorithm: str,
#     parameters: Optional[Dict] = None,
#     ion_labels: Optional[List[str]] = None,
#     use_tic: bool = False,
#     smoothing: bool = True,
#     window_size: int = 3,
# ) -> SegmentationResult:

#     if parameters is None:
#         parameters = {}

#     logger.info(
#         f"Dataset {dataset_id}: starting segmentation from AnnData "
#         f"(algorithm={algorithm})"
#     )

#     # 1. Load from existing AnnData
#     from image_segmentation.loader import anndata_to_segmentation_input
#     intensity_matrix, pixel_coordinates, ion_labels, image_shape = anndata_to_segmentation_input(
#         adata=adata,
#         dataset_id=dataset_id,
#         ion_labels=ion_labels,
#     )

#     # 2. Preprocess
#     segmentation_input = preprocess(
#         intensity_matrix=intensity_matrix,
#         pixel_coordinates=pixel_coordinates,
#         ion_labels=ion_labels,
#         image_shape=image_shape,
#         dataset_id=dataset_id,
#         use_tic=use_tic,
#     )

#     # 3. Dispatch
#     raw_output = dispatch(
#         segmentation_input=segmentation_input,
#         algorithm=algorithm,
#         parameters=parameters,
#     )

#     # 4. Postprocess
#     result = postprocess(
#         raw_output=raw_output,
#         segmentation_input=segmentation_input,
#         smoothing=smoothing,
#         window_size=window_size,
#     )

#     logger.info(
#         f"Dataset {dataset_id}: segmentation complete "
#         f"(n_segments={result.n_segments})"
#     )

#     return result
