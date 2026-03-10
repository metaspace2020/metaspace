from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from anndata import AnnData

from image_segmentation.dispatcher import dispatch
from image_segmentation.loader import (
    anndata_to_segmentation_input,
    load_segmentation_input,
    load_segmentation_input_from_s3,
)
from image_segmentation.postprocessing import postprocess
from image_segmentation.preprocessing import preprocess
from image_segmentation.types import SegmentationResult

logger = logging.getLogger(__name__)


def run_segmentation(
    dataset_id: str,
    algorithm: str,
    databases: Optional[List] = None,
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

    logger.info(
        f"Dataset {dataset_id}: starting segmentation "
        f"(algorithm={algorithm}, fdr={fdr})"
    )

    # 1. Load — prefer S3 pre-built input, fall back to Python client
    if input_s3_key is not None:
        logger.info(f"Dataset {dataset_id}: loading input from S3 key '{input_s3_key}'")
        intensity_matrix, pixel_coordinates, ion_labels, image_shape = (
            load_segmentation_input_from_s3(s3_key=input_s3_key)
        )
    else:
        if not databases:
            raise ValueError(
                f"Dataset {dataset_id}: either 'input_s3_key' or 'databases' must be provided"
            )
        logger.info(f"Dataset {dataset_id}: loading input via Python client (databases={databases})")
        intensity_matrix, pixel_coordinates, ion_labels, image_shape = load_segmentation_input(
            dataset_id=dataset_id,
            databases=databases,
            fdr=fdr,
            adducts=adducts,
            min_mz=min_mz,
            max_mz=max_mz,
            ion_labels=ion_labels,
            use_tic=use_tic,
            off_sample=off_sample,
        )

    # 2. Preprocess
    segmentation_input = preprocess(
        intensity_matrix=intensity_matrix,
        pixel_coordinates=pixel_coordinates,
        ion_labels=ion_labels,
        image_shape=image_shape,
        dataset_id=dataset_id,
        use_tic=use_tic,
    )

    # 3. Dispatch
    raw_output = dispatch(
        segmentation_input=segmentation_input,
        algorithm=algorithm,
        parameters=parameters,
    )

    # 4. Postprocess
    result = postprocess(
        raw_output=raw_output,
        segmentation_input=segmentation_input,
        smoothing=smoothing,
        window_size=window_size,
    )

    logger.info(
        f"Dataset {dataset_id}: segmentation complete "
        f"(n_segments={result.n_segments})"
    )

    return result


def run_segmentation_from_anndata(
    adata: AnnData,
    dataset_id: str,
    algorithm: str,
    parameters: Optional[Dict] = None,
    ion_labels: Optional[List[str]] = None,
    use_tic: bool = False,
    smoothing: bool = True,
    window_size: int = 3,
) -> SegmentationResult:

    if parameters is None:
        parameters = {}

    logger.info(
        f"Dataset {dataset_id}: starting segmentation from AnnData "
        f"(algorithm={algorithm})"
    )

    # 1. Load from existing AnnData
    intensity_matrix, pixel_coordinates, ion_labels, image_shape = anndata_to_segmentation_input(
        adata=adata,
        dataset_id=dataset_id,
        ion_labels=ion_labels,
    )

    # 2. Preprocess
    segmentation_input = preprocess(
        intensity_matrix=intensity_matrix,
        pixel_coordinates=pixel_coordinates,
        ion_labels=ion_labels,
        image_shape=image_shape,
        dataset_id=dataset_id,
        use_tic=use_tic,
    )

    # 3. Dispatch
    raw_output = dispatch(
        segmentation_input=segmentation_input,
        algorithm=algorithm,
        parameters=parameters,
    )

    # 4. Postprocess
    result = postprocess(
        raw_output=raw_output,
        segmentation_input=segmentation_input,
        smoothing=smoothing,
        window_size=window_size,
    )

    logger.info(
        f"Dataset {dataset_id}: segmentation complete "
        f"(n_segments={result.n_segments})"
    )

    return result