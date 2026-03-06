# metaspace/segmentation/algorithms/pca_gmm.py

from __future__ import annotations

import logging
from typing import Dict, List, Literal, Optional, Tuple

import numpy as np
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture

from .base import BaseSegmentationAlgorithm
from ..types import RawAlgorithmOutput, SegmentationInput

logger = logging.getLogger(__name__)


# --- Internal helpers ---


def _run_pca(
    matrix: np.ndarray,
    n_components: Optional[int] = None,
    variance_threshold: float = 0.95,
) -> Tuple[np.ndarray, np.ndarray, int]:

    # Fit once with maximum useful components
    max_components = min(matrix.shape[0], matrix.shape[1])
    pca = PCA(n_components=max_components)
    all_scores = pca.fit_transform(matrix)                          # (n_pixels, max_components)
    cumulative_variance = np.cumsum(pca.explained_variance_ratio_)  # (max_components,)

    if n_components is not None:
        n_selected = min(n_components, max_components)
        logger.info(f"PCA: using fixed n_components={n_selected}")
    else:
        n_selected = int(np.searchsorted(cumulative_variance, variance_threshold) + 1)
        n_selected = min(n_selected, max_components)
        logger.info(
            f"PCA: auto-selected {n_selected} components "
            f"({cumulative_variance[n_selected - 1]:.3f} cumulative variance "
            f"at threshold {variance_threshold})"
        )

    # Slice scores — no second fit needed
    pc_scores = all_scores[:, :n_selected]

    return pc_scores, cumulative_variance, n_selected

def _find_elbow(k_values: List[int], scores: List[float]) -> int:

    # Filter out rejected k values
    valid = [(k, s) for k, s in zip(k_values, scores) if s is not None]
    valid_k = [k for k, s in valid]
    valid_scores = [s for k, s in valid]

    if len(valid_k) < 3:
        logger.warning("Too few valid k values to detect elbow — returning minimum BIC k")
        return valid_k[int(np.argmin(valid_scores))]

    # Normalize both axes to [0, 1] so curvature is comparable
    k_norm = (np.array(valid_k) - valid_k[0]) / (valid_k[-1] - valid_k[0])
    s_norm = (np.array(valid_scores) - min(valid_scores)) / (
        max(valid_scores) - min(valid_scores)
    )

    # For each point, compute distance from the line connecting first and last point
    # The elbow is the point with maximum distance from this line
    # Line vector from first to last point
    line_vec = np.array([k_norm[-1] - k_norm[0], s_norm[-1] - s_norm[0]])
    line_vec_norm = line_vec / np.linalg.norm(line_vec)

    # Vector from first point to each point
    distances = []
    for i in range(len(valid_k)):
        point_vec = np.array([k_norm[i] - k_norm[0], s_norm[i] - s_norm[0]])
        # Perpendicular distance from the line
        cross = np.abs(np.cross(line_vec_norm, point_vec))
        distances.append(cross)

    elbow_idx = int(np.argmax(distances))
    elbow_k = valid_k[elbow_idx]

    logger.info(f"Elbow detection: selected k={elbow_k} (distances={[f'{d:.3f}' for d in distances]})")

    return elbow_k


def _select_k_via_criterion(
    pc_scores: np.ndarray,
    k_range: Tuple[int, int],
    criterion: Literal["bic", "aic"] = "bic",
) -> Tuple[int, Dict]:

    k_min, k_max = k_range
    k_values = list(range(k_min, k_max + 1))
    scores = []

    for k in k_values:
        gmm = GaussianMixture(n_components=k, random_state=42)
        gmm.fit(pc_scores)
        score = gmm.bic(pc_scores) if criterion == "bic" else gmm.aic(pc_scores)
        scores.append(score)
        logger.debug(f"GMM k={k}: {criterion.upper()}={score:.2f}")

    #best_k = k_values[int(np.argmin(scores))]
    best_k = _find_elbow(k_values, scores)
    logger.info(f"GMM: auto-selected k={best_k} via {criterion.upper()}")

    curve = {
        "k_values": k_values,
        "scores": scores,
        "selected_k": best_k,
        "criterion": criterion,
    }

    return best_k, curve


def _run_gmm(
    pc_scores: np.ndarray,
    k: int,
) -> np.ndarray:

    gmm = GaussianMixture(n_components=k, random_state=42)
    labels = gmm.fit_predict(pc_scores)
    logger.info(f"GMM: fitted k={k}, unique labels={np.unique(labels)}")
    return labels


def _reconstruct_label_map(
    labels: np.ndarray,
    pixel_coordinates: np.ndarray,
    image_shape: Tuple[int, int],
) -> np.ndarray:

    width, height = image_shape
    label_map = np.full((height, width), np.nan)

    xs = pixel_coordinates[:, 0]
    ys = pixel_coordinates[:, 1]
    label_map[ys, xs] = labels

    return label_map


# --- Algorithm class ---


class PCAGMMAlgorithm(BaseSegmentationAlgorithm):

    @property
    def algorithm_name(self) -> str:
        return "pca_gmm"

    def validate_parameters(self, parameters: dict) -> dict:

        validated = {
            "n_components": parameters.get("n_components", None),
            "variance_threshold": parameters.get("variance_threshold", 0.95),
            "k": parameters.get("k", None),
            "k_range": tuple(parameters.get("k_range", (2, 10))),
            "criterion": parameters.get("criterion", "bic"),
        }

        if validated["n_components"] is not None:
            if not isinstance(validated["n_components"], int) or validated["n_components"] < 1:
                raise ValueError(
                    f"n_components must be a positive integer, "
                    f"got {validated['n_components']}"
                )

        if not 0.0 < validated["variance_threshold"] <= 1.0:
            raise ValueError(
                f"variance_threshold must be in (0, 1], "
                f"got {validated['variance_threshold']}"
            )

        if validated["k"] is not None:
            if not isinstance(validated["k"], int) or validated["k"] < 2:
                raise ValueError(
                    f"k must be an integer >= 2, got {validated['k']}"
                )

        k_min, k_max = validated["k_range"]
        if k_min < 2 or k_max < k_min:
            raise ValueError(
                f"k_range must satisfy k_min >= 2 and k_max >= k_min, "
                f"got {validated['k_range']}"
            )

        if validated["criterion"] not in ("bic", "aic"):
            raise ValueError(
                f"criterion must be 'bic' or 'aic', got {validated['criterion']}"
            )

        return validated

    def run(
        self,
        segmentation_input: SegmentationInput,
        parameters: dict,
    ) -> RawAlgorithmOutput:

        parameters = self.validate_parameters(parameters)

        logger.info(
            f"Dataset {segmentation_input.dataset_id}: running PCA+GMM "
            f"on {segmentation_input.n_pixels} pixels x {segmentation_input.n_ions} ions"
        )

        # 1. PCA
        pc_scores, explained_variance, n_selected = _run_pca(
            matrix=segmentation_input.intensity_matrix,
            n_components=parameters["n_components"],
            variance_threshold=parameters["variance_threshold"],
        )

        # 2. k selection or fixed k
        bic_curve = None
        if parameters["k"] is not None:
            k = parameters["k"]
            logger.info(f"GMM: using fixed k={k}")
        else:
            k, bic_curve = _select_k_via_criterion(
                pc_scores=pc_scores,
                k_range=parameters["k_range"],
                criterion=parameters["criterion"],
            )

        # 3. GMM
        labels = _run_gmm(pc_scores, k)

        # 4. Reconstruct label map
        label_map = _reconstruct_label_map(
            labels=labels,
            pixel_coordinates=segmentation_input.pixel_coordinates,
            image_shape=segmentation_input.image_shape,
        )

        return RawAlgorithmOutput(
            map_type="unified",
            label_map=label_map,
            n_segments=k,
            algorithm=self.algorithm_name,
            parameters_used=parameters,
            bic_curve=bic_curve,
            explained_variance=explained_variance,
            spatial_weights=None,
        )