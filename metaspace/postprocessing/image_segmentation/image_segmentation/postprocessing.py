# metaspace/segmentation/postprocessor.py

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.ndimage import generic_filter

from .types import RawAlgorithmOutput, SegmentationInput, SegmentationResult

logger = logging.getLogger(__name__)


# --- Internal helpers ---


def _majority_vote(
    label_map: np.ndarray,
    window_size: int = 3,
) -> np.ndarray:

    if window_size % 2 == 0:
        raise ValueError(f"window_size must be odd, got {window_size}")

    valid_mask = ~np.isnan(label_map)

    def vote(values: np.ndarray) -> float:
        # Filter out NaNs from the neighborhood
        valid = values[~np.isnan(values)]
        if len(valid) == 0:
            return np.nan
        counts = np.bincount(valid.astype(int))
        return float(np.argmax(counts))

    smoothed = generic_filter(
        label_map,
        function=vote,
        size=window_size,
        mode="constant",
        cval=np.nan,
    )

    # Restore NaN for pixels that were missing before smoothing
    smoothed[~valid_mask] = np.nan

    return smoothed


def _smooth_label_maps(
    label_map: np.ndarray | Dict[str, np.ndarray],
    map_type: str,
    window_size: int = 3,
) -> np.ndarray | Dict[str, np.ndarray]:

    if map_type == "unified":
        return _majority_vote(label_map, window_size)
    else:
        return {
            ion: _majority_vote(ion_map, window_size)
            for ion, ion_map in label_map.items()
        }


def _compute_enrichment_profiles(
    intensity_matrix: np.ndarray,
    ion_labels: List[str],
    labels: np.ndarray,
    n_segments: int,
) -> pd.DataFrame:
    """Return a long DataFrame with columns: segment_id, ion_label, enrich_score.

    Each row represents the fold-enrichment of one ion in one segment relative
    to the global mean intensity across all pixels.  Rows with NaN enrich_score
    indicate empty segments or zero-mean ions.
    """
    global_means = intensity_matrix.mean(axis=0)    # (n_ions,)
    global_means_safe = np.where(global_means == 0, np.nan, global_means)

    records: List[dict] = []
    for seg_id in range(n_segments):
        seg_mask = labels == seg_id
        if seg_mask.sum() == 0:
            logger.warning(f"Segment {seg_id} has no pixels — enrichment set to NaN")
            scores = np.full(len(ion_labels), np.nan)
        else:
            seg_means = intensity_matrix[seg_mask].mean(axis=0)
            scores = seg_means / global_means_safe

        for i, ion in enumerate(ion_labels):
            records.append({
                'segment_id': seg_id,
                'ion_label': ion,
                'enrich_score': float(scores[i]),
            })

    return pd.DataFrame(records, columns=['segment_id', 'ion_label', 'enrich_score'])


def _compute_segment_summary(
    label_map: np.ndarray,
    enrichment_profiles: pd.DataFrame,
    n_segments: int,
    top_n: int = 20,
) -> List[dict]:
    """Build a per-segment summary from the long enrichment_profiles DataFrame."""
    valid_pixels = int(np.sum(~np.isnan(label_map)))
    summary = []

    for seg_id in range(n_segments):
        size_px = int(np.sum(label_map == seg_id))
        coverage_fraction = size_px / valid_pixels if valid_pixels > 0 else 0.0

        seg_rows = enrichment_profiles[enrichment_profiles['segment_id'] == seg_id]
        top_ions = (
            seg_rows.dropna(subset=['enrich_score'])
            .sort_values('enrich_score', ascending=False)
            .head(top_n)['ion_label']
            .tolist()
        )

        summary.append({
            "id": seg_id,
            "size_px": size_px,
            "coverage_fraction": round(coverage_fraction, 4),
            "top_ions": top_ions,
        })

    return summary


def _extract_flat_labels(
    label_map: np.ndarray,
    pixel_coordinates: np.ndarray,
) -> np.ndarray:

    xs = pixel_coordinates[:, 0]
    ys = pixel_coordinates[:, 1]
    return label_map[ys, xs].astype(int)


# --- Top-level postprocessor ---


def postprocess(
    raw_output: RawAlgorithmOutput,
    segmentation_input: SegmentationInput,
    smoothing: bool = True,
    window_size: int = 3,
    top_n_ions: int = 20,
) -> SegmentationResult:

    logger.info(
        f"Dataset {segmentation_input.dataset_id}: "
        f"postprocessing {raw_output.algorithm} output "
        f"(map_type={raw_output.map_type})"
    )

    # 1. Smoothing
    label_map = raw_output.label_map
    if smoothing:
        label_map = _smooth_label_maps(
            label_map=label_map,
            map_type=raw_output.map_type,
            window_size=window_size,
        )
        logger.info(f"Applied majority vote smoothing (window={window_size}x{window_size})")

    # 2 & 3. Enrichment profiles and segment summary — unified maps only
    segment_profiles: Optional[pd.DataFrame] = None
    segment_summary: Optional[List[dict]] = None

    if raw_output.map_type == "unified":
        flat_labels = _extract_flat_labels(
            label_map=label_map,
            pixel_coordinates=segmentation_input.pixel_coordinates,
        )

        segment_profiles = _compute_enrichment_profiles(
            intensity_matrix=segmentation_input.intensity_matrix,
            ion_labels=segmentation_input.ion_labels,
            labels=flat_labels,
            n_segments=raw_output.n_segments,
        )

        segment_summary = _compute_segment_summary(
            label_map=label_map,
            enrichment_profiles=segment_profiles,
            n_segments=raw_output.n_segments,
            top_n=top_n_ions,
        )

    return SegmentationResult(
        dataset_id=segmentation_input.dataset_id,
        algorithm=raw_output.algorithm,
        parameters_used=raw_output.parameters_used,
        map_type=raw_output.map_type,
        label_map=label_map,
        n_segments=raw_output.n_segments,
        segment_profiles=segment_profiles,
        segment_summary=segment_summary,
        diagnostics={
            "bic_curve": raw_output.bic_curve,
            "explained_variance": (
                raw_output.explained_variance.tolist()
                if raw_output.explained_variance is not None
                else None
            ),
            "spatial_weights": raw_output.spatial_weights,
            "assignment_confidence_histogram": raw_output.assignment_confidence_histogram,
        },
    )
