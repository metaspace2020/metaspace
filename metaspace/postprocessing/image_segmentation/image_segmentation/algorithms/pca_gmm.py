"""PCA + Gaussian mixture segmentation (elbow k-selection, optional fixed k)."""

from __future__ import annotations

import time

import logging
from typing import Dict, List, Literal, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from scipy.spatial import KDTree
from scipy.stats import norm as scipy_norm
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture

from .base import BaseSegmentationAlgorithm
from ..types import RawAlgorithmOutput, SegmentationInput

logger = logging.getLogger(__name__)


# --- Internal helpers ---


MAX_ALLOWED_COMPONENTS = 50  # pylint: disable=invalid-name
MIN_MORANS_I = 0.1
MAX_GMM_PCS = 30
SMALL_DATASET_THRESHOLD = 5000


def _run_pca(matrix: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Fit PCA and return (all_scores, cumulative_variance).

    Computes up to min(n_pixels, n_ions, MAX_ALLOWED_COMPONENTS) components.
    PC selection for GMM is handled downstream by the Moran's I permutation filter.
    """
    max_components = min(matrix.shape[0], matrix.shape[1], MAX_ALLOWED_COMPONENTS)
    pca = PCA(n_components=max_components)
    all_scores = pca.fit_transform(matrix)
    cumulative_variance = np.cumsum(pca.explained_variance_ratio_)
    logger.info("PCA: computed %d components", max_components)
    return all_scores, cumulative_variance


def _build_weight_matrix(pixel_coordinates: np.ndarray) -> csr_matrix:
    """Sparse symmetric binary queen-contiguity weight matrix (8-connected).

    r=1.5 captures cardinal + diagonal neighbors (√2 ≈ 1.414 < 1.5 < 2.0).
    """
    tree = KDTree(pixel_coordinates)
    pairs = tree.query_pairs(r=1.5)

    n = len(pixel_coordinates)  # pylint: disable=invalid-name
    if not pairs:
        return csr_matrix((n, n))

    rows, cols = map(list, zip(*pairs))
    all_rows = rows + cols
    all_cols = cols + rows
    data = np.ones(len(all_rows), dtype=np.float64)
    return csr_matrix((data, (all_rows, all_cols)), shape=(n, n))


def _compute_morans_i(  # pylint: disable=invalid-name,too-many-locals
    all_scores: np.ndarray,
    pixel_coordinates: np.ndarray,
    n_permutations: int = 999,
    p_threshold: float = 0.05,
    seed: Optional[int] = None,
) -> pd.DataFrame:
    """Compute Moran's I for every PC and apply two-gate selection.

    Gate 1 — p-value:
      N < SMALL_DATASET_THRESHOLD: one-sided permutation p-value < p_threshold.
      N >= SMALL_DATASET_THRESHOLD: one-sided analytical z-test (H0: I = E[I]).

    Gate 2 — absolute floor: I_observed >= MIN_MORANS_I.

    Returns:
        DataFrame with columns: pc, morans_i, p_value, p_method,
        passes_p_gate, passes_morans_floor, passes_both.
    """
    N, K = all_scores.shape
    rng = np.random.default_rng(seed)

    W = _build_weight_matrix(pixel_coordinates)
    S0 = float(W.sum())

    if S0 == 0.0:
        logger.warning(
            "Moran's I: weight matrix has no edges (all pixels isolated) — "
            "returning zero Moran's I for all %d PCs",
            K,
        )
        return pd.DataFrame(
            {
                "pc": np.arange(1, K + 1),
                "morans_i": np.zeros(K),
                "p_value": np.ones(K),
                "p_method": ["none"] * K,
                "passes_p_gate": np.zeros(K, dtype=bool),
                "passes_morans_floor": np.zeros(K, dtype=bool),
                "passes_both": np.zeros(K, dtype=bool),
            }
        )

    # Column-centre scores; denominator is invariant under row permutation
    z = all_scores - all_scores.mean(axis=0)  # (N, K)
    denom = (z * z).sum(axis=0)  # (K,)

    zero_var = denom == 0
    if zero_var.any():
        logger.warning(
            "Moran's I: %d constant PC(s) detected — Moran's I will be 0, will not pass gates",
            int(zero_var.sum()),
        )
    safe_denom = np.where(zero_var, 1.0, denom)

    I_observed = (N / S0) * (z * (W @ z)).sum(axis=0) / safe_denom  # (K,)

    if N < SMALL_DATASET_THRESHOLD:
        # Permutation null — one shuffle per iteration, all K PCs in one matmul
        null_matrix = np.empty((n_permutations, K), dtype=np.float64)
        for i in range(n_permutations):
            perm = rng.permutation(N)
            z_perm = z[perm]
            null_matrix[i] = (N / S0) * (z_perm * (W @ z_perm)).sum(axis=0) / safe_denom

        count_ge = (null_matrix >= I_observed).sum(axis=0)
        p_value = (count_ge + 1) / (n_permutations + 1)
        p_method = ["permutation"] * K
        logger.info(
            "Moran's I: permutation null (N=%d < %d, %d iters)",
            N,
            SMALL_DATASET_THRESHOLD,
            n_permutations,
        )
    else:
        # Analytical one-sided z-test
        # E[I] = -1/(N-1)
        # For binary symmetric W: S1 = 2*S0, S2 = 4*sum(degree^2)
        # Var[I] = [N^2*S1 - N*S2 + 3*S0^2] / [S0^2*(N^2-1)] - E[I]^2
        E_I = -1.0 / (N - 1)
        S1 = 2.0 * S0
        degrees = np.asarray(W.sum(axis=1)).ravel()
        S2 = 4.0 * float((degrees ** 2).sum())
        var_I = (N ** 2 * S1 - N * S2 + 3 * S0 ** 2) / (S0 ** 2 * (N ** 2 - 1)) - E_I ** 2
        std_I = np.sqrt(max(var_I, 0.0))
        z_score = np.zeros(K) if std_I == 0.0 else (I_observed - E_I) / std_I
        p_value = scipy_norm.sf(z_score)  # one-sided: P(Z > z)
        p_method = ["analytical_z"] * K
        logger.info(
            "Moran's I: analytical z-test (N=%d >= %d)",
            N,
            SMALL_DATASET_THRESHOLD,
        )

    passes_p_gate = p_value < p_threshold
    passes_morans_floor = I_observed >= MIN_MORANS_I
    passes_both = passes_p_gate & passes_morans_floor

    logger.info(
        "Moran's I: %d/%d pass p-gate, %d/%d pass floor (>=%.2f), %d/%d pass both",
        int(passes_p_gate.sum()),
        K,
        int(passes_morans_floor.sum()),
        K,
        MIN_MORANS_I,
        int(passes_both.sum()),
        K,
    )

    return pd.DataFrame(
        {
            "pc": np.arange(1, K + 1),
            "morans_i": I_observed,
            "p_value": p_value,
            "p_method": p_method,
            "passes_p_gate": passes_p_gate,
            "passes_morans_floor": passes_morans_floor,
            "passes_both": passes_both,
        }
    )


def _find_elbow(k_values: List[int], scores: List[float]) -> int:  # pylint: disable=too-many-locals
    # Filter out rejected k values
    valid = [(k, s) for k, s in zip(k_values, scores) if s is not None]
    valid_k = [k for k, s in valid]
    valid_scores = [s for k, s in valid]

    if len(valid_k) < 3:
        logger.warning("Too few valid k values to detect elbow — returning minimum BIC k")
        return valid_k[int(np.argmin(valid_scores))]

    # Normalize both axes to [0, 1] so curvature is comparable
    k_norm = (np.array(valid_k) - valid_k[0]) / (valid_k[-1] - valid_k[0])
    s_norm = (np.array(valid_scores) - min(valid_scores)) / (max(valid_scores) - min(valid_scores))

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

    dist_str = ", ".join(f"{d:.3f}" for d in distances)
    logger.info(
        "[SEGMENTATION_PERF] Elbow detection: selected k=%s (distances=[%s])",
        elbow_k,
        dist_str,
    )

    return elbow_k


def _select_k_via_criterion(
    pc_scores: np.ndarray,
    k_range: Tuple[int, int],
    criterion: Literal["bic", "aic"] = "bic",
) -> Tuple[int, Dict]:

    k_min, k_max = k_range

    # Short-circuit: k_range may collapse to a single value when the PC-count
    # clamping guard in run() sets new_k_max = max(k_min, n_selected_pcs) = k_min.
    # _find_elbow cannot handle a single-element list, so bypass it here.
    if k_min == k_max:
        gmm = GaussianMixture(n_components=k_min, random_state=42)
        gmm.fit(pc_scores)
        score = gmm.bic(pc_scores) if criterion == "bic" else gmm.aic(pc_scores)
        logger.info(
            "GMM: k_range collapsed to single value — using k=%d (%s=%.2f)",
            k_min,
            criterion.upper(),
            score,
        )
        return k_min, {
            "k_values": [k_min],
            "scores": [score],
            "selected_k": k_min,
            "criterion": criterion,
        }

    k_values = list(range(k_min, k_max + 1))
    scores = []

    for k in k_values:
        gmm = GaussianMixture(n_components=k, random_state=42)
        gmm.fit(pc_scores)
        score = gmm.bic(pc_scores) if criterion == "bic" else gmm.aic(pc_scores)
        scores.append(score)
        logger.debug("GMM k=%s: %s=%.2f", k, criterion.upper(), score)

    # best_k = k_values[int(np.argmin(scores))]
    best_k = _find_elbow(k_values, scores)
    logger.info("GMM: auto-selected k=%s via %s", best_k, criterion.upper())

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
    n_histogram_bins: int = 50,
) -> Tuple[np.ndarray, dict]:

    gmm = GaussianMixture(n_components=k, random_state=42)
    gmm.fit(pc_scores)
    labels = gmm.predict(pc_scores)
    proba = gmm.predict_proba(pc_scores)  # (n_pixels, k)
    confidence = proba.max(axis=1)  # (n_pixels,)

    counts, bin_edges = np.histogram(confidence, bins=n_histogram_bins, range=(0.0, 1.0))
    confidence_histogram = {
        "counts": counts.tolist(),
        "bin_edges": np.round(bin_edges, 6).tolist(),
    }

    logger.info(
        "GMM: fitted k=%s, unique labels=%s, mean confidence=%.3f",
        k,
        np.unique(labels),
        float(confidence.mean()),
    )
    return labels, confidence_histogram


def _reconstruct_label_map(
    labels: np.ndarray,
    pixel_coordinates: np.ndarray,
    image_shape: Tuple[int, int],
) -> np.ndarray:

    width, height = image_shape
    label_map = np.full((height, width), np.nan)

    x_idx = pixel_coordinates[:, 0]
    y_idx = pixel_coordinates[:, 1]
    label_map[y_idx, x_idx] = labels

    return label_map


# --- Algorithm class ---


class PCAGMMAlgorithm(BaseSegmentationAlgorithm):
    """Segment voxels with PCA dimensionality reduction and a Gaussian mixture model."""

    @property
    def algorithm_name(self) -> str:
        return "pca_gmm"

    def validate_parameters(self, parameters: dict) -> dict:  # pylint: disable=too-many-branches
        validated = {
            # Kept for API compatibility — no longer used internally; PC selection
            # is handled by the Moran's I permutation filter.
            "n_components": parameters.get("n_components", None),
            "variance_threshold": parameters.get("variance_threshold", 0.95),
            "k": parameters.get("k", None),
            "k_range": tuple(parameters.get("k_range", (2, 10))),
            "criterion": parameters.get("criterion", "bic"),
            # Moran's I
            "n_permutations": parameters.get("n_permutations", 999),
            "p_threshold": parameters.get("p_threshold", 0.05),
            "morans_seed": parameters.get("morans_seed", None),
        }

        if validated["k"] is not None:
            if not isinstance(validated["k"], int) or validated["k"] < 2:
                raise ValueError(f"k must be an integer >= 2, got {validated['k']}")

        k_min, k_max = validated["k_range"]
        if k_min < 2 or k_max < k_min:
            raise ValueError(
                f"k_range must satisfy k_min >= 2 and k_max >= k_min, "
                f"got {validated['k_range']}"
            )

        if validated["criterion"] not in ("bic", "aic"):
            raise ValueError(f"criterion must be 'bic' or 'aic', got {validated['criterion']}")

        if not isinstance(validated["n_permutations"], int) or validated["n_permutations"] < 1:
            raise ValueError(
                f"n_permutations must be a positive integer, got {validated['n_permutations']}"
            )

        if not 0.0 < validated["p_threshold"] < 1.0:
            raise ValueError(f"p_threshold must be in (0, 1), got {validated['p_threshold']}")

        return validated

    def run(  # pylint: disable=too-many-locals,too-many-statements
        self, segmentation_input: SegmentationInput, parameters: dict
    ) -> RawAlgorithmOutput:
        start_time = time.time()
        parameters = self.validate_parameters(parameters)

        logger.info(
            "Dataset %s: running PCA+GMM on %s pixels x %s ions",
            segmentation_input.dataset_id,
            segmentation_input.n_pixels,
            segmentation_input.n_ions,
        )

        # 1. PCA
        pca_start_time = time.time()
        all_scores, explained_variance = _run_pca(segmentation_input.intensity_matrix)
        pca_time = time.time() - pca_start_time
        logger.info("[SEGMENTATION_PERF] PCA completed in %.3fs", pca_time)

        # 1b. Moran's I on all computed PCs
        morans_start_time = time.time()
        morans_df = _compute_morans_i(
            all_scores=all_scores,
            pixel_coordinates=segmentation_input.pixel_coordinates,
            n_permutations=parameters["n_permutations"],
            p_threshold=parameters["p_threshold"],
            seed=parameters["morans_seed"],
        )
        morans_i_result = {col: morans_df[col].tolist() for col in morans_df.columns}
        morans_time = time.time() - morans_start_time
        logger.info("[SEGMENTATION_PERF] Moran's I completed in %.3fs", morans_time)

        # 1c. Select PCs that pass both gates, capped at MAX_GMM_PCS
        selected_indices = np.where(morans_df["passes_both"].to_numpy())[0]
        if len(selected_indices) == 0:
            logger.warning("No PCs passed Moran's I filter — falling back to first 5 PCs")
            selected_indices = np.arange(min(5, all_scores.shape[1]))
        elif len(selected_indices) > MAX_GMM_PCS:
            logger.warning(
                "%d PCs passed Moran's I filter — capping to first %d",
                len(selected_indices),
                MAX_GMM_PCS,
            )
            selected_indices = selected_indices[:MAX_GMM_PCS]
        pc_scores = all_scores[:, selected_indices]
        n_selected_pcs = pc_scores.shape[1]
        logger.info(
            "Moran's I PC selection: %d PCs selected for GMM (0-based indices: %s)",
            n_selected_pcs,
            selected_indices.tolist(),
        )

        # Guard: k cannot exceed the number of selected PCs
        if parameters["k"] is not None:
            if parameters["k"] > n_selected_pcs:
                clamped_k = max(2, n_selected_pcs)
                logger.warning(
                    "Requested k=%d exceeds selected PCs (%d) — clamping k to %d",
                    parameters["k"],
                    n_selected_pcs,
                    clamped_k,
                )
                parameters = {**parameters, "k": clamped_k}
        else:
            k_min, k_max = parameters["k_range"]
            if k_max > n_selected_pcs:
                new_k_max = max(k_min, n_selected_pcs)
                logger.warning(
                    "k_range upper bound %d exceeds selected PCs (%d) — clamping to %d",
                    k_max,
                    n_selected_pcs,
                    new_k_max,
                )
                parameters = {**parameters, "k_range": (k_min, new_k_max)}

        # 2. k selection or fixed k
        k_selection_start_time = time.time()
        bic_curve = None
        if parameters["k"] is not None:
            k = parameters["k"]
            logger.info("GMM: using fixed k=%s", k)
        else:
            k, bic_curve = _select_k_via_criterion(
                pc_scores=pc_scores,
                k_range=parameters["k_range"],
                criterion=parameters["criterion"],
            )
        k_selection_time = time.time() - k_selection_start_time
        logger.info("[SEGMENTATION_PERF] k selection completed in %.3fs", k_selection_time)

        # 3. GMM
        gmm_start_time = time.time()
        labels, confidence_histogram = _run_gmm(pc_scores, k)
        gmm_time = time.time() - gmm_start_time
        logger.info("[SEGMENTATION_PERF] GMM completed in %.3fs", gmm_time)

        # 4. Reconstruct label map
        label_map_start_time = time.time()
        label_map = _reconstruct_label_map(
            labels=labels,
            pixel_coordinates=segmentation_input.pixel_coordinates,
            image_shape=segmentation_input.image_shape,
        )
        label_map_time = time.time() - label_map_start_time
        logger.info(
            "[SEGMENTATION_PERF] Label map reconstruction completed in %.3fs",
            label_map_time,
        )

        total_time = time.time() - start_time
        logger.info("[SEGMENTATION_PERF] Total algorithm time: %.3fs", total_time)

        return RawAlgorithmOutput(
            map_type="unified",
            label_map=label_map,
            n_segments=k,
            algorithm=self.algorithm_name,
            parameters_used=parameters,
            bic_curve=bic_curve,
            explained_variance=explained_variance,
            spatial_weights=None,
            assignment_confidence_histogram=confidence_histogram,
            morans_i=morans_i_result,
        )
