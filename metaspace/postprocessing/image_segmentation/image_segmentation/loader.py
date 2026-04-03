# metaspace/segmentation/loader.py

from __future__ import annotations

import json
import logging
import os
import time
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import boto3
import numpy as np

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / 'conf' / 'config.json'


def _load_config() -> Dict:
    """Read conf/config.json from the microservice's conf directory."""
    with open(_CONFIG_PATH) as f:
        return json.load(f)


def _get_s3_client(cfg: Dict):
    """Build an S3 client from a loaded config dict (mirrors sm.engine.storage logic)."""
    boto_config = boto3.session.Config(signature_version='s3v4')
    if 'aws' in cfg:
        return boto3.client(
            's3',
            region_name=cfg['aws']['aws_default_region'],
            aws_access_key_id=cfg['aws']['aws_access_key_id'],
            aws_secret_access_key=cfg['aws']['aws_secret_access_key'],
            config=boto_config,
        )
    storage = cfg['storage']
    return boto3.client(
        's3',
        endpoint_url=storage['endpoint_url'],
        aws_access_key_id=storage['access_key_id'],
        aws_secret_access_key=storage['secret_access_key'],
        config=boto_config,
    )


# ---------------------------------------------------------------------------
# S3 loader (primary path when input has been pre-built by the engine)
# ---------------------------------------------------------------------------

def load_segmentation_input_from_s3(
    s3_key: str,
    bucket: Optional[str] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str], Tuple[int, int]]:
    """Load segmentation input arrays from a .npz file stored in S3.

    This is the primary loading path when the engine has pre-built the input
    via SegmentationDataLoader.prepare_segmentation_input.

    Args:
        s3_key:  S3 key of the .npz file, e.g. 'segmentation/<ds_id>/input.npz'.
        bucket:  S3 bucket name.  Falls back to image_storage.bucket in conf/config.json.

    Returns:
        (intensity_matrix, pixel_coordinates, ion_labels, image_shape) —
        the same tuple produced by load_segmentation_input / anndata_to_segmentation_input.
    """
    s3_load_start_time = time.time()
    cfg = _load_config()
    if bucket is None:
        bucket = cfg['imzml_browser_storage']['bucket']

    logger.info(f'[SEGMENTATION_PERF] Loading segmentation input from s3://{bucket}/{s3_key}')
    logger.info(f'Loading segmentation input from s3://{bucket}/{s3_key}')
    
    s3_client_start = time.time()
    s3 = _get_s3_client(cfg)
    s3_client_time = time.time() - s3_client_start
    
    s3_download_start = time.time()
    obj = s3.get_object(Bucket=bucket, Key=s3_key)
    data = np.load(BytesIO(obj['Body'].read()), allow_pickle=False)
    s3_download_time = time.time() - s3_download_start

    data_processing_start = time.time()
    intensity_matrix = data['intensity_matrix']
    pixel_coordinates = data['pixel_coordinates']
    ion_labels: List[str] = data['ion_labels'].tolist()
    image_shape: Tuple[int, int] = tuple(int(v) for v in data['image_shape'])
    data_processing_time = time.time() - data_processing_start
    
    total_s3_load_time = time.time() - s3_load_start_time
    logger.info(f'[SEGMENTATION_PERF] S3 load completed in {total_s3_load_time:.3f}s (client: {s3_client_time:.3f}s, download: {s3_download_time:.3f}s, processing: {data_processing_time:.3f}s)')
    logger.info(
        f'Loaded segmentation input: '
        f'{intensity_matrix.shape[0]} pixels × {len(ion_labels)} ions, '
        f'image shape {image_shape}'
    )
    return intensity_matrix, pixel_coordinates, ion_labels, image_shape

# python 3.9+
# def anndata_to_segmentation_input(
#     adata,
#     dataset_id: str,
#     ion_labels: Optional[List[str]] = None,
# ) -> Tuple[np.ndarray, np.ndarray, List[str], Tuple[int, int]]:
#     from metaspace_converter.constants import COL

#     # Subset ions if requested
#     if ion_labels is not None:
#         missing = set(ion_labels) - set(adata.var_names)
#         if missing:
#             logger.warning(
#                 f"Dataset {dataset_id}: {len(missing)} requested ions not found "
#                 f"in AnnData: {missing}"
#             )
#         ion_labels = [i for i in ion_labels if i in adata.var_names]
#         adata = adata[:, ion_labels]
#     else:
#         ion_labels = list(adata.var_names)

#     if not ion_labels:
#         raise ValueError(
#             f"Dataset {dataset_id}: no valid ions remain after filtering. "
#             f"Check your ion_labels or upstream annotation filters."
#         )

#     # Extract intensity matrix — convert sparse to dense if needed
#     X = adata.X
#     if hasattr(X, "toarray"):
#         X = X.toarray()
#     intensity_matrix = X.astype(float)

#     # Extract pixel coordinates
#     pixel_coordinates = adata.obs[
#         [COL.ion_image_pixel_x, COL.ion_image_pixel_y]
#     ].values.astype(int)

#     # Mask background pixels — zero total intensity across all ions means off-tissue
#     pixel_totals = intensity_matrix.sum(axis=1)
#     foreground_mask = pixel_totals > 0

#     n_background = (~foreground_mask).sum()
#     if n_background > 0:
#         logger.info(
#             f"Dataset {dataset_id}: masking {n_background} background pixels "
#             f"({n_background / len(foreground_mask) * 100:.1f}% of total pixels)"
#         )

#     intensity_matrix = intensity_matrix[foreground_mask]
#     pixel_coordinates = pixel_coordinates[foreground_mask]

#     # Extract image shape
#     width = int(adata.obs[COL.ion_image_shape_x].iloc[0])
#     height = int(adata.obs[COL.ion_image_shape_y].iloc[0])
#     image_shape = (width, height)

#     logger.info(
#         f"Dataset {dataset_id}: extracted matrix "
#         f"{intensity_matrix.shape[0]} pixels x {len(ion_labels)} ions, "
#         f"image shape {image_shape}"
#     )

#     return intensity_matrix, pixel_coordinates, ion_labels, image_shape


# # ---------------------------------------------------------------------------
# # Helpers
# # ---------------------------------------------------------------------------

# def _get_sm_instance():
#     from metaspace import SMInstance
#     api_key = os.environ.get('METASPACE_API_KEY')
#     return SMInstance(api_key=api_key)


# def _merge_adatas(adatas: List, dataset_id: str):
#     import anndata as ad

#     seen: set = set()
#     unique_slices = []
#     for adata in adatas:
#         new_vars = [v for v in adata.var_names if v not in seen]
#         if new_vars:
#             unique_slices.append(adata[:, new_vars].copy())
#             seen.update(new_vars)

#     if not unique_slices:
#         raise ValueError(
#             f"Dataset {dataset_id}: no unique ions found across all databases"
#         )

#     if len(unique_slices) == 1:
#         return unique_slices[0]

#     merged = ad.concat(unique_slices, axis=1, merge='same')
#     logger.info(
#         f"Dataset {dataset_id}: merged {len(adatas)} databases "
#         f"→ {merged.n_vars} unique ions"
#     )
#     return merged


# def _filter_by_adducts(adata, adducts: List[str], dataset_id: str):
#     col = 'adduct'
#     if col not in adata.var.columns:
#         logger.warning(
#             f"Dataset {dataset_id}: 'adduct' column not in adata.var — "
#             "skipping adduct filter"
#         )
#         return adata

#     mask = adata.var[col].isin(adducts)
#     n_kept = int(mask.sum())
#     if n_kept == 0:
#         raise ValueError(
#             f"Dataset {dataset_id}: no ions remain after adduct filter {adducts}. "
#             "Check adduct names (e.g. '+H', '+Na')."
#         )
#     logger.info(
#         f"Dataset {dataset_id}: adduct filter {adducts} "
#         f"→ {n_kept}/{len(mask)} ions kept"
#     )
#     return adata[:, mask]


# # ---------------------------------------------------------------------------
# # Public loader
# # ---------------------------------------------------------------------------

# def load_segmentation_input(
#     dataset_id: str,
#     databases: List[Union[Tuple[str, str], List[str]]],
#     fdr: float = 0.2,
#     adducts: Optional[List[str]] = None,
#     min_mz: Optional[float] = None,
#     max_mz: Optional[float] = None,
#     ion_labels: Optional[List[str]] = None,
#     use_tic: bool = False,
#     off_sample: Optional[bool] = False,
# ) -> Tuple[np.ndarray, np.ndarray, List[str], Tuple[int, int]]:
#     """Fetch ion-image data from METASPACE and convert to segmentation inputs.

#     Args:
#         dataset_id:  METASPACE dataset ID.
#         databases:   One or more molecular databases, each as a (name, version)
#                      tuple or list, e.g. [["HMDB", "v4"], ["LipidMaps", "2021"]].
#         fdr:         Maximum FDR threshold for annotation inclusion.
#         adducts:     Optional list of adduct strings to keep, e.g. ["+H", "+Na"].
#                      Applied as a post-fetch filter on adata.var['adduct'].
#         min_mz:      Lower m/z bound passed server-side via mzFilter.
#         max_mz:      Upper m/z bound passed server-side via mzFilter.
#         ion_labels:  Explicit list of ion labels to retain after loading.
#         use_tic:     Use TIC-normalised intensities.
#         off_sample:  Off-sample filter. False (default) = on-sample only,
#                      True = off-sample only, None = no filter (include all).
#                      If the dataset has no off-sample classification, the filter
#                      is silently dropped and all annotations are returned.
#     """
#     from metaspace_converter.to_anndata import metaspace_to_anndata

#     sm = _get_sm_instance()

#     # Pre-fetch the SMDataset once — reused across all database calls
#     sm_dataset = sm.dataset(id=dataset_id)

#     # Build server-side annotation filter
#     annotation_filter: Dict = {}
#     if min_mz is not None or max_mz is not None:
#         mz_filter: Dict = {}
#         if min_mz is not None:
#             mz_filter['min'] = min_mz
#         if max_mz is not None:
#             mz_filter['max'] = max_mz
#         annotation_filter['mzFilter'] = mz_filter
#     if off_sample is not None:
#         annotation_filter['offSample'] = off_sample

#     def _fetch_adatas(ann_filter: Dict) -> List:
#         result = []
#         for database in databases:
#             db_tuple = tuple(database)
#             logger.info(
#                 f"Dataset {dataset_id}: fetching database={db_tuple}, fdr={fdr}"
#             )
#             adata = metaspace_to_anndata(
#                 dataset=sm_dataset,
#                 database=db_tuple,
#                 fdr=fdr,
#                 use_tic=use_tic,
#                 **ann_filter,
#             )
#             if adata is not None and adata.n_vars > 0:
#                 result.append(adata)
#             else:
#                 logger.warning(
#                     f"Dataset {dataset_id}: database={db_tuple} returned no annotations"
#                 )
#         return result

#     adatas = _fetch_adatas(annotation_filter)

#     # If the off-sample filter was applied but yielded nothing, the dataset
#     # likely has no off-sample classification — retry without the filter.
#     if not adatas and off_sample is not None:
#         logger.warning(
#             f"Dataset {dataset_id}: offSample={off_sample} filter returned no annotations "
#             f"(dataset may not have off-sample classification). Retrying without off-sample filter."
#         )
#         fallback_filter = {k: v for k, v in annotation_filter.items() if k != 'offSample'}
#         adatas = _fetch_adatas(fallback_filter)

#     if not adatas:
#         raise ValueError(
#             f"Dataset {dataset_id}: no annotations found across databases "
#             f"{databases} at fdr={fdr}"
#         )

#     adata = _merge_adatas(adatas, dataset_id) if len(adatas) > 1 else adatas[0]

#     # Post-fetch adduct filter (GraphQL only accepts a single adduct at a time)
#     if adducts:
#         adata = _filter_by_adducts(adata, adducts, dataset_id)

#     return anndata_to_segmentation_input(
#         adata=adata,
#         dataset_id=dataset_id,
#         ion_labels=ion_labels,
#     )
