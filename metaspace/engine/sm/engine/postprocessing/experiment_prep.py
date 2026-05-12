"""Engine-side PREP step for experiment statistical analysis.

Per dataset:
1. Find the most recent FINISHED annotation job.
2. Load all its annotations + iso_image_ids + moldb/adduct/fdr.
3. Apply the experiment filter chain (fdr -> moldb -> adduct), recording
   per-step counts in ``filterChain``.
4. For each region, rasterise the mask per ``sourceKind``:
   - 'roi'                  -> public.roi.geojson polygon-fill
   - 'segmentation_cluster' -> dataset's SEGMENTATION/LABEL_MAP diagnostic
   - 'whole'                -> first iso-image foreground (>0)
5. Load each surviving annotation's principal iso-image (PNG-decoded into a 2D
   float32 array) and compute the mean intensity over the region mask.
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import PIL.Image
from botocore.exceptions import ClientError

from sm.engine.db import DB
from sm.engine import image_storage as _image_storage
from sm.engine.annotation.diagnostics import (
    DiagnosticImageKey,
    get_dataset_diagnostics,
    load_npy_image,
)
from sm.engine.postprocessing.experiment_masks import (
    rasterise_roi_mask,
    rasterise_segmentation_mask,
    rasterise_whole_mask,
)

logger = logging.getLogger('engine')


def _default_load_iso_image(ds_id: str, image_id: str) -> np.ndarray:
    """Fetch a principal ion-image (PNG) and return its first channel as float32."""
    img_bytes = _image_storage.get_image(_image_storage.ISO, ds_id, image_id)
    img = PIL.Image.open(BytesIO(img_bytes))
    arr = np.asarray(img, dtype=np.float32)
    if arr.ndim == 3:
        arr = arr[:, :, 0]
    return arr


def _default_load_label_map(ds_id: str, segmentation_id: str) -> Optional[Tuple[np.ndarray, int]]:
    """Return ``(label_map, segment_index)`` for a segmentation row, or None."""

    db = DB()
    row = db.select_one(
        'SELECT dataset_id, segment_index FROM segmentation WHERE id=%s',
        params=(segmentation_id,),
    )
    if not row:
        return None
    seg_ds_id, segment_index = row
    if seg_ds_id != ds_id:
        logger.warning(f'experiment_prep: segmentation belongs to ds {seg_ds_id}, not {ds_id}')
    diagnostics = get_dataset_diagnostics(seg_ds_id)
    label_map_image_id: Optional[str] = None
    for diag in diagnostics:
        if diag.get('type') != 'SEGMENTATION':
            continue
        for img in diag.get('images') or []:
            if img.get('key') == DiagnosticImageKey.LABEL_MAP.value:
                label_map_image_id = img.get('image_id')
                break
        if label_map_image_id:
            break
    if not label_map_image_id:
        return None
    label_map = load_npy_image(seg_ds_id, label_map_image_id)
    return label_map, int(segment_index)


def _latest_finished_job_id(db, dataset_id: str) -> Optional[int]:
    row = db.select_one(
        "SELECT id FROM job WHERE ds_id=%s AND status='FINISHED' "
        "ORDER BY finish DESC NULLS LAST, id DESC LIMIT 1",
        params=(dataset_id,),
    )
    return row[0] if row else None


def _load_annotations(db, job_id: int):
    return db.select(
        "SELECT a.id, a.ion_id, a.fdr, a.adduct, j.moldb_id, a.iso_image_ids, "
        "       mdb.name "
        "FROM annotation a "
        "JOIN job j ON j.id=a.job_id "
        "LEFT JOIN molecular_db mdb ON mdb.id=j.moldb_id "
        "WHERE a.job_id=%s",
        params=(job_id,),
    )


def _apply_filter_chain(rows, filters: Dict[str, Any]):
    # Row tuple layout (from _load_annotations):
    #   [0] annotation.id
    #   [1] ion_id
    #   [2] fdr
    #   [3] adduct
    #   [4] moldb_id
    #   [5] iso_image_ids   (list[str]; [0] is the principal ion-image id)
    #   [6] moldb_name      (optional trailing field)
    #
    # `current` is the running list of surviving rows (same tuple shape as input).
    # `chain` is a list of step dicts describing the filter funnel:
    #   {'name': str, 'count': int, 'droppedFromPrev': int}
    # The first entry is the pre-filter total; each _step appends one entry.
    chain = [{'name': 'All annotated ions', 'count': len(rows), 'droppedFromPrev': 0}]
    current = list(rows)

    def _step(name: str, predicate: Callable):
        nonlocal current
        before = len(current)
        current = [r for r in current if predicate(r)]
        chain.append(
            {'name': name, 'count': len(current), 'droppedFromPrev': before - len(current)}
        )

    fdr_max = filters.get('fdr')
    if fdr_max is not None:
        _step(f'+FDR <= {fdr_max}', lambda r: r[2] is not None and r[2] <= fdr_max)
    moldb_allow = filters.get('moldb_ids')
    if moldb_allow:
        allow = set(moldb_allow)
        _step('+DB allow-list', lambda r: r[4] in allow)
    adduct_allow = filters.get('adducts')
    if adduct_allow:
        allow = set(adduct_allow)
        _step('+adduct allow-list', lambda r: r[3] in allow)
    # iso_image_ids is at index 5; rows may also carry a trailing moldb_name (index 6).
    current = [r for r in current if r[1] is not None and r[5]]
    return current, chain


def _load_roi_geojson(db, roi_id: int) -> Optional[Dict[str, Any]]:
    row = db.select_one('SELECT geojson FROM public.roi WHERE id=%s', params=(roi_id,))
    return row[0] if row else None


def _merge_chain(acc, new):
    if not acc:
        return [dict(step) for step in new]
    by_name = {step['name']: step for step in acc}
    for step in new:
        if step['name'] in by_name:
            by_name[step['name']]['count'] += step['count']
            by_name[step['name']]['droppedFromPrev'] += step['droppedFromPrev']
        else:
            acc.append(dict(step))
    return acc


# pylint: disable=too-many-locals too-many-statements too-many-branches
def build_prep_block(
    db,
    datasets: List[Dict[str, Any]],
    filters: Dict[str, Any],
    *,
    load_iso_image: Optional[Callable[[str, str], np.ndarray]] = None,
    load_label_map: Optional[Callable[[str, str], Optional[Tuple[np.ndarray, int]]]] = None,
) -> Dict[str, Any]:
    """Assemble the engine-side PREP block for an experiment run."""
    if load_iso_image is None:
        load_iso_image = _default_load_iso_image
    if load_label_map is None:
        load_label_map = _default_load_label_map

    samples: List[Dict[str, Any]] = []
    intensities: Dict[str, Dict[int, float]] = {}
    ion_ids_seen: set = set()
    aggregate_chain: List[Dict[str, Any]] = []
    all_ions_by_ion_id: Dict[int, Dict[str, Any]] = {}

    for ds in datasets:
        ds_id = ds['dataset_id']
        job_id = _latest_finished_job_id(db, ds_id)
        if job_id is None:
            logger.info(f'experiment_prep: no FINISHED job for dataset {ds_id}')
            continue
        all_rows = _load_annotations(db, job_id)
        # Collect a per-ion snapshot BEFORE filtering so the frontend can
        # recompute the chain client-side. Dedupicated by ion_id keeping first.
        for row in all_rows:
            ion_id = row[1]
            if ion_id is None or ion_id in all_ions_by_ion_id:
                continue
            moldb_name = row[6] if len(row) > 6 else None
            all_ions_by_ion_id[ion_id] = {
                'ion_id': ion_id,
                'fdr': row[2],
                'adduct': row[3],
                'moldb_id': row[4],
                'moldb_name': moldb_name,
            }
        surviving, ds_chain = _apply_filter_chain(all_rows, filters)
        aggregate_chain = _merge_chain(aggregate_chain, ds_chain)

        if not surviving:
            continue

        # Iso-images for an older FINISHED job may have been deleted (e.g. while
        # a re-annotation is in progress). Find the first surviving row whose
        # principal image actually loads, so we can determine mask dimensions;
        # rows with missing images are dropped.
        image_cache: Dict[str, np.ndarray] = {}
        first_image: Optional[np.ndarray] = None
        first_idx = 0
        for idx, surv_row in enumerate(surviving):
            principal = surv_row[5][0]
            try:
                first_image = load_iso_image(ds_id, principal)
            except ClientError as exc:
                logger.warning(
                    f'experiment_prep: missing iso image {principal} for ds {ds_id}: {exc}'
                )
                continue
            image_cache[principal] = first_image
            first_idx = idx
            break

        if first_image is None:
            logger.warning(f'experiment_prep: no loadable iso images for ds {ds_id}; skipping')
            continue

        surviving = surviving[first_idx:]
        height, width = first_image.shape

        for region in ds.get('regions') or []:
            if region.get('labelGroupName') is None:
                continue
            md_dict = region.get('metadata') or {}
            # Per metadata spec: sampleId defaults to dataset_id when blank.
            sample_id = (md_dict.get('sampleId') or '').strip() or ds_id
            kind = region.get('sourceKind')
            mask: Optional[np.ndarray] = None
            if kind == 'whole':
                mask = rasterise_whole_mask(first_image)
            elif kind == 'roi' and region.get('roiId') is not None:
                geojson = _load_roi_geojson(db, region['roiId'])
                if geojson:
                    mask = rasterise_roi_mask(geojson, region['roiId'], width, height)
            elif kind == 'segmentation_cluster' and region.get('segmentationId'):
                meta = load_label_map(ds_id, region['segmentationId'])
                if meta is not None:
                    label_map, segment_index = meta
                    mask = rasterise_segmentation_mask(label_map, segment_index)

            region_key = region.get('regionKey') or f'{ds_id}::{sample_id}'

            if mask is None or mask.sum() == 0:
                logger.warning(f'empty mask for {region_key} in ds {ds_id}')
                continue

            rows_idx, cols_idx = np.where(mask > 0)
            tic = 0.0
            region_ints = intensities.setdefault(region_key, {})
            for surv_row in surviving:
                ion_id = surv_row[1]
                iso = surv_row[5]
                principal = iso[0]
                arr = image_cache.get(principal)
                if arr is None:
                    try:
                        arr = load_iso_image(ds_id, principal)
                    except ClientError as exc:
                        logger.warning(
                            f'experiment_prep: missing iso image {principal} '
                            f'for ds {ds_id}: {exc}'
                        )
                        continue
                    image_cache[principal] = arr
                vals = arr[rows_idx, cols_idx].astype(np.float64)
                mean_val = float(vals.mean()) if vals.size else 0.0
                region_ints[ion_id] = mean_val
                tic += mean_val
                ion_ids_seen.add(ion_id)

            samples.append(
                {
                    'regionKey': region_key,
                    'sampleId': sample_id,
                    'datasetId': ds_id,
                    'labelGroupName': region.get('labelGroupName'),
                    'condition': md_dict.get('condition'),
                    'biologicalReplicateId': md_dict.get('biologicalReplicateId'),
                    'technicalReplicateId': md_dict.get('technicalReplicateId'),
                    'batchId': md_dict.get('batchId'),
                    'tic': tic,
                }
            )

    return {
        'samples': samples,
        'intensities': intensities,
        'ions_total': len(ion_ids_seen),
        'filterChain': aggregate_chain,
        'all_ions': list(all_ions_by_ion_id.values()),
    }
