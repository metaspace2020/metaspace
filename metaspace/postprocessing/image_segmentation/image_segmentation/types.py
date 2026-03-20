# metaspace/segmentation/types.py

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple, Union

import numpy as np
import pandas as pd


@dataclass
class SegmentationInput:
    """Read-only after construction. Do not modify fields directly."""
    intensity_matrix: np.ndarray            # (n_pixels, n_ions), float, no NaNs
    pixel_coordinates: np.ndarray           # (n_pixels, 2), int — (x, y) pairs
    ion_labels: List[str]                   # length n_ions
    image_shape: Tuple[int, int]            # (width, height)
    dataset_id: str

    def __post_init__(self):
        n_pixels, n_ions = self.intensity_matrix.shape
        assert self.pixel_coordinates.shape == (n_pixels, 2), \
            f"Coordinates shape {self.pixel_coordinates.shape} inconsistent with matrix"
        assert len(self.ion_labels) == n_ions, \
            f"ion_labels length {len(self.ion_labels)} != n_ions={n_ions}"

    @property
    def n_pixels(self) -> int:
        return self.intensity_matrix.shape[0]

    @property
    def n_ions(self) -> int:
        return self.intensity_matrix.shape[1]


@dataclass
class RawAlgorithmOutput:
    map_type: Literal["unified", "per_ion"]
    label_map: Union[np.ndarray, Dict[str, np.ndarray]]
    n_segments: Union[int, Dict[str, int]]
    algorithm: str
    parameters_used: dict

    # Diagnostics — None if not applicable
    bic_curve: Optional[dict]
    explained_variance: Optional[np.ndarray]
    spatial_weights: Optional[np.ndarray]
    assignment_confidence_histogram: Optional[dict] = None  # {"counts": [...], "bin_edges": [...]}


@dataclass
class SegmentationResult:
    dataset_id: str
    algorithm: str
    parameters_used: dict

    map_type: Literal["unified", "per_ion"]
    label_map: Union[np.ndarray, Dict[str, np.ndarray]]
    n_segments: Union[int, Dict[str, int]]

    segment_profiles: Optional[pd.DataFrame]   # long format: segment_id, ion_label, enrich_score
    segment_summary: Optional[List[dict]]
    diagnostics: dict