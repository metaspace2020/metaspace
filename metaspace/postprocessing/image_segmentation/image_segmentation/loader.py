# metaspace/segmentation/loader.py

from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional, Tuple, Union

import anndata as ad
import numpy as np
from anndata import AnnData

from metaspace import SMInstance
from metaspace_converter.to_anndata import metaspace_to_anndata
from metaspace_converter.constants import COL

logger = logging.getLogger(__name__)


def anndata_to_segmentation_input(
    adata: AnnData,
    dataset_id: str,
    ion_labels: Optional[List[str]] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str], Tuple[int, int]]:
    # Subset ions if requested
    if ion_labels is not None:
        missing = set(ion_labels) - set(adata.var_names)
        if missing:
            logger.warning(
                f"Dataset {dataset_id}: {len(missing)} requested ions not found "
                f"in AnnData: {missing}"
            )
        ion_labels = [i for i in ion_labels if i in adata.var_names]
        adata = adata[:, ion_labels]
    else:
        ion_labels = list(adata.var_names)

    if not ion_labels:
        raise ValueError(
            f"Dataset {dataset_id}: no valid ions remain after filtering. "
            f"Check your ion_labels or upstream annotation filters."
        )

    # Extract intensity matrix — convert sparse to dense if needed
    X = adata.X
    if hasattr(X, "toarray"):
        X = X.toarray()
    intensity_matrix = X.astype(float)

    # Extract pixel coordinates
    pixel_coordinates = adata.obs[
        [COL.ion_image_pixel_x, COL.ion_image_pixel_y]
    ].values.astype(int)

    # Mask background pixels — zero total intensity across all ions means off-tissue
    pixel_totals = intensity_matrix.sum(axis=1)
    foreground_mask = pixel_totals > 0

    n_background = (~foreground_mask).sum()
    if n_background > 0:
        logger.info(
            f"Dataset {dataset_id}: masking {n_background} background pixels "
            f"({n_background / len(foreground_mask) * 100:.1f}% of total pixels)"
        )

    intensity_matrix = intensity_matrix[foreground_mask]
    pixel_coordinates = pixel_coordinates[foreground_mask]

    # Extract image shape
    width = int(adata.obs[COL.ion_image_shape_x].iloc[0])
    height = int(adata.obs[COL.ion_image_shape_y].iloc[0])
    image_shape = (width, height)

    logger.info(
        f"Dataset {dataset_id}: extracted matrix "
        f"{intensity_matrix.shape[0]} pixels x {len(ion_labels)} ions, "
        f"image shape {image_shape}"
    )

    return intensity_matrix, pixel_coordinates, ion_labels, image_shape


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_sm_instance() -> SMInstance:
    """Return an authenticated SMInstance using the service-account API key.

    The key is read from the METASPACE_API_KEY environment variable.
    If the variable is absent, SMInstance falls back to ~/.metaspace.
    """
    api_key = os.environ.get('METASPACE_API_KEY')
    return SMInstance(api_key=api_key)


def _merge_adatas(adatas: List[AnnData], dataset_id: str) -> AnnData:
    """Merge AnnDatas from multiple databases along the var (ion) axis.

    All inputs share the same obs (pixels). Duplicate var_names across
    databases are dropped — the first occurrence wins.
    """
    seen: set = set()
    unique_slices: List[AnnData] = []
    for adata in adatas:
        new_vars = [v for v in adata.var_names if v not in seen]
        if new_vars:
            unique_slices.append(adata[:, new_vars].copy())
            seen.update(new_vars)

    if not unique_slices:
        raise ValueError(
            f"Dataset {dataset_id}: no unique ions found across all databases"
        )

    if len(unique_slices) == 1:
        return unique_slices[0]

    merged = ad.concat(unique_slices, axis=1, merge='same')
    logger.info(
        f"Dataset {dataset_id}: merged {len(adatas)} databases "
        f"→ {merged.n_vars} unique ions"
    )
    return merged


def _filter_by_adducts(adata: AnnData, adducts: List[str], dataset_id: str) -> AnnData:
    """Keep only ions whose adduct is in the requested list."""
    col = 'adduct'
    if col not in adata.var.columns:
        logger.warning(
            f"Dataset {dataset_id}: 'adduct' column not in adata.var — "
            "skipping adduct filter"
        )
        return adata

    mask = adata.var[col].isin(adducts)
    n_kept = int(mask.sum())
    if n_kept == 0:
        raise ValueError(
            f"Dataset {dataset_id}: no ions remain after adduct filter {adducts}. "
            "Check adduct names (e.g. '+H', '+Na')."
        )
    logger.info(
        f"Dataset {dataset_id}: adduct filter {adducts} "
        f"→ {n_kept}/{len(mask)} ions kept"
    )
    return adata[:, mask]


# ---------------------------------------------------------------------------
# Public loader
# ---------------------------------------------------------------------------

def load_segmentation_input(
    dataset_id: str,
    databases: List[Union[Tuple[str, str], List[str]]],
    fdr: float = 0.2,
    adducts: Optional[List[str]] = None,
    min_mz: Optional[float] = None,
    max_mz: Optional[float] = None,
    ion_labels: Optional[List[str]] = None,
    use_tic: bool = False,
    off_sample: Optional[bool] = False,
) -> Tuple[np.ndarray, np.ndarray, List[str], Tuple[int, int]]:
    """Fetch ion-image data from METASPACE and convert to segmentation inputs.

    Args:
        dataset_id:  METASPACE dataset ID.
        databases:   One or more molecular databases, each as a (name, version)
                     tuple or list, e.g. [["HMDB", "v4"], ["LipidMaps", "2021"]].
        fdr:         Maximum FDR threshold for annotation inclusion.
        adducts:     Optional list of adduct strings to keep, e.g. ["+H", "+Na"].
                     Applied as a post-fetch filter on adata.var['adduct'].
        min_mz:      Lower m/z bound passed server-side via mzFilter.
        max_mz:      Upper m/z bound passed server-side via mzFilter.
        ion_labels:  Explicit list of ion labels to retain after loading.
        use_tic:     Use TIC-normalised intensities.
        off_sample:  Off-sample filter. False (default) = on-sample only,
                     True = off-sample only, None = no filter (include all).
                     If the dataset has no off-sample classification, the filter
                     is silently dropped and all annotations are returned.
    """
    sm = _get_sm_instance()

    # Pre-fetch the SMDataset once — reused across all database calls
    sm_dataset = sm.dataset(id=dataset_id)

    # Build server-side annotation filter
    annotation_filter: Dict = {}
    if min_mz is not None or max_mz is not None:
        mz_filter: Dict = {}
        if min_mz is not None:
            mz_filter['min'] = min_mz
        if max_mz is not None:
            mz_filter['max'] = max_mz
        annotation_filter['mzFilter'] = mz_filter
    if off_sample is not None:
        annotation_filter['offSample'] = off_sample

    def _fetch_adatas(ann_filter: Dict) -> List[AnnData]:
        result: List[AnnData] = []
        for database in databases:
            db_tuple = tuple(database)
            logger.info(
                f"Dataset {dataset_id}: fetching database={db_tuple}, fdr={fdr}"
            )
            adata = metaspace_to_anndata(
                dataset=sm_dataset,
                database=db_tuple,
                fdr=fdr,
                use_tic=use_tic,
                **ann_filter,
            )
            if adata is not None and adata.n_vars > 0:
                result.append(adata)
            else:
                logger.warning(
                    f"Dataset {dataset_id}: database={db_tuple} returned no annotations"
                )
        return result

    adatas = _fetch_adatas(annotation_filter)

    # If the off-sample filter was applied but yielded nothing, the dataset
    # likely has no off-sample classification — retry without the filter.
    if not adatas and off_sample is not None:
        logger.warning(
            f"Dataset {dataset_id}: offSample={off_sample} filter returned no annotations "
            f"(dataset may not have off-sample classification). Retrying without off-sample filter."
        )
        fallback_filter = {k: v for k, v in annotation_filter.items() if k != 'offSample'}
        adatas = _fetch_adatas(fallback_filter)

    if not adatas:
        raise ValueError(
            f"Dataset {dataset_id}: no annotations found across databases "
            f"{databases} at fdr={fdr}"
        )

    adata = _merge_adatas(adatas, dataset_id) if len(adatas) > 1 else adatas[0]

    # Post-fetch adduct filter (GraphQL only accepts a single adduct at a time)
    if adducts:
        adata = _filter_by_adducts(adata, adducts, dataset_id)

    return anndata_to_segmentation_input(
        adata=adata,
        dataset_id=dataset_id,
        ion_labels=ion_labels,
    )
