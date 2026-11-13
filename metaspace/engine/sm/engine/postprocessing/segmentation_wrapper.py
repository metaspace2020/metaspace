import json
import logging
import math
import time
from typing import List, Optional

import numpy as np
import requests

from sm.engine import image_storage
from sm.engine.annotation.diagnostics import (
    DiagnosticImageFormat,
    DiagnosticImageKey,
    save_diagnostic_image,
)
from sm.engine.formula_parser import format_ion_formula
from sm.engine.postprocessing.segmentation_data_loader import SegmentationDataLoader

logger = logging.getLogger('update-daemon')


def submit_segmentation_job(  # pylint: disable=too-many-arguments, too-many-locals
    ds_id,
    job_id,
    algorithm,
    database_ids,
    fdr,
    params,
    db,
    services_config,
    adducts=None,
    min_mz=None,
    max_mz=None,
    off_sample=False,
):
    """Prepare segmentation input, then fire-and-forget to the microservice.

    Returns immediately after the service accepts the job (HTTP 202).
    The service will POST results back to services_config['segmentation_callback']
    when done.
    """
    submit_start_time = time.time()
    logger.info(
        f'[SEGMENTATION_PERF] submit_segmentation_job started for dataset {ds_id}, job {job_id}'
    )

    segmentation_endpoint = services_config['segmentation']
    callback_url = services_config['segmentation_callback']

    # 1. Load ion images from DB/S3, TIC-normalise, and upload input arrays to S3
    data_load_start = time.time()
    logger.info(f'Loading segmentation data for dataset {ds_id}, job {job_id}')
    try:
        loader = SegmentationDataLoader(ds_id, db)
        input_s3_key = loader.prepare_segmentation_input(
            database_ids=database_ids,
            fdr=fdr,
            adducts=adducts,
            off_sample=off_sample,
            min_mz=min_mz,
            max_mz=max_mz,
        )
        data_load_time = time.time() - data_load_start
        logger.info(
            f"""[SEGMENTATION_PERF] Data loading completed
             in {data_load_time:.3f}s for dataset {ds_id}"""
        )
        logger.info(
            f'Successfully prepared segmentation input for dataset {ds_id}, S3 key: {input_s3_key}'
        )
    except Exception as e:
        logger.error(
            f'Failed to prepare segmentation input for dataset {ds_id}: {e}', exc_info=True
        )
        raise

    logger.info(
        f'Submitting segmentation job {job_id} for dataset {ds_id} to {segmentation_endpoint}'
    )

    payload = {
        'dataset_id': ds_id,
        'job_id': job_id,
        'algorithm': algorithm,
        'input_s3_key': input_s3_key,
        'parameters': params,
        'callback_url': callback_url,
    }
    logger.debug(f'Segmentation request payload: {payload}')

    try:
        service_call_start = time.time()
        resp = requests.post(
            f'{segmentation_endpoint}/segmentation/run',
            json=payload,
            timeout=30,
        )
        service_call_time = time.time() - service_call_start
        logger.info(
            f"""[SEGMENTATION_PERF] Service call completed
             in {service_call_time:.3f}s for job {job_id}"""
        )
        logger.info(
            f'Segmentation service responded with status {resp.status_code} for job {job_id}'
        )

        if not resp.ok:
            try:
                detail = resp.json().get('error', resp.text)
            except Exception:
                detail = resp.text
            logger.error(f'Segmentation service error for job {job_id}: response={detail}')
            raise RuntimeError(f"Segmentation service error ({resp.status_code}): {detail}")
    except requests.exceptions.RequestException as e:
        logger.error(
            f'Network error calling segmentation service for job {job_id}: {e}', exc_info=True
        )
        raise RuntimeError(f"Failed to connect to segmentation service: {e}") from e

    total_submit_time = time.time() - submit_start_time
    logger.info(
        f"""[SEGMENTATION_PERF] submit_segmentation_job completed
         in {total_submit_time:.3f}s for job {job_id}"""
    )
    logger.info(f'Segmentation job {job_id} accepted by service for dataset {ds_id}')


def _replaced_job_ids(
    db, ds_id: str, job_id: int, is_default: bool, user_id: Optional[str]
) -> List[int]:
    """Find the finished jobs that a newly finished job replaces (same slot only).

    Args:
        db: Database wrapper.
        ds_id: Dataset ID.
        job_id: The job that just finished (excluded).
        is_default: Whether that job is the dataset's default job.
        user_id: Owner of that job (used for private jobs).

    Returns:
        IDs of the default jobs (default slot) or of the owner's private jobs (private slot).
        A legacy private row with NULL user_id never matches, which fails safe (kept).
        Jobs whose segments an experiment region references are kept (their segments would
        cascade away otherwise); they stay as FINISHED orphans of the slot.
    """
    sql = (
        'SELECT id FROM image_segmentation_job '
        "WHERE ds_id = %s AND id <> %s AND status NOT IN ('QUEUED', 'STARTED') "
    )
    if is_default:
        rows = db.select(sql + 'AND is_default = true', (ds_id, job_id))
    else:
        rows = db.select(sql + 'AND is_default = false AND user_id = %s', (ds_id, job_id, user_id))
    candidates = [row[0] for row in rows]
    if not candidates:
        return []
    referenced = {
        row[0]
        for row in db.select(
            'SELECT DISTINCT s.job_id '
            'FROM segmentation s '
            'JOIN experiment_dataset ed ON ed.dataset_id = s.dataset_id '
            'WHERE s.job_id = ANY(%s) '
            'AND EXISTS (SELECT 1 FROM jsonb_array_elements(ed.regions) r '
            "WHERE r->>'segmentationId' = s.id::text)",
            (candidates,),
        )
    }
    for old_id in candidates:
        if old_id in referenced:
            logger.warning(
                f'Keeping replaced segmentation job {old_id} for dataset {ds_id}: '
                'used by an experiment'
            )
    return [old_id for old_id in candidates if old_id not in referenced]


def save_segmentation_result(
    ds_id, job_id, result, db
):  # pylint: disable=too-many-locals, too-many-statements
    """Save a completed segmentation result to the DB.

    Called from the API callback endpoint when the microservice posts back.
    """
    save_start_time = time.time()
    logger.info(
        f"""[SEGMENTATION_PERF] save_segmentation_result started
         for dataset {ds_id}, job {job_id}"""
    )
    logger.info(f'Saving segmentation result for dataset {ds_id}, job {job_id}')
    logger.debug(f'Result keys: {list(result.keys())}')

    algorithm = result['algorithm']

    job_row = db.select_one(
        'SELECT user_id, is_default FROM image_segmentation_job WHERE id = %s', (job_id,)
    )
    if not job_row:
        logger.warning(f'Segmentation job {job_id} no longer exists; dropping result')
        return
    user_id, is_default = job_row

    # 1. Save label_map as NPY and store it, with the summary, on the job row
    raw_label_map = result['label_map']

    # Handle None values in label_map by replacing with -1 (background)
    if raw_label_map is None:
        raise ValueError(f'Label map is None for dataset {ds_id}, job {job_id}')

    # Convert to numpy array and handle the structure properly
    # The label_map could be 1D or 2D depending on the segmentation service format
    try:
        # First try direct conversion
        label_map = np.array(raw_label_map, dtype=np.int32)
        logger.debug(f'Label map converted successfully, shape: {label_map.shape}')
    except (ValueError, TypeError) as e:
        logger.debug(f'Direct conversion failed: {e}, trying element-wise processing')

        # Handle nested structure or None values element by element
        def process_element(element):
            if element is None:
                return -1  # Use -1 for background/unknown
            elif isinstance(element, (list, tuple)):
                # If it's a nested structure, process recursively
                return [process_element(sub_elem) for sub_elem in element]
            else:
                return int(element)

        processed_label_map = process_element(raw_label_map)
        label_map = np.array(processed_label_map, dtype=np.int32)
        logger.debug(f'Label map processed element-wise, final shape: {label_map.shape}')

    label_map_save_start = time.time()
    label_map_image = save_diagnostic_image(
        ds_id, label_map, key=DiagnosticImageKey.LABEL_MAP, fmt=DiagnosticImageFormat.NPY
    )
    label_map_save_time = time.time() - label_map_save_start
    logger.info(
        f"""[SEGMENTATION_PERF] Label map saved in {label_map_save_time:.3f}s
         for dataset {ds_id}"""
    )

    summary = {
        'algorithm': result['algorithm'],
        'map_type': result['map_type'],
        'n_segments': result['n_segments'],
        'parameters_used': result['parameters_used'],
        'segment_summary': result['segment_summary'],
        'diagnostics': result['diagnostics'],
    }
    db.alter(
        'UPDATE image_segmentation_job '
        'SET result = %s, label_map_image_id = %s, label_map_image_url = %s WHERE id = %s',
        params=(json.dumps(summary), label_map_image['image_id'], label_map_image['url'], job_id),
    )

    # 2. Insert one segmentation row per segment; let DB generate UUIDs
    n_segments = result['n_segments']
    segmentation_insert_start = time.time()
    seg_uuids = db.insert_return(
        '''INSERT INTO segmentation (dataset_id, job_id, segment_index, algorithm, status)
           VALUES (%s, %s, %s, %s, %s)
           RETURNING id''',
        rows=[(ds_id, job_id, seg_idx, algorithm, 'FINISHED') for seg_idx in range(n_segments)],
    )
    segmentation_insert_time = time.time() - segmentation_insert_start
    logger.info(
        f"""[SEGMENTATION_PERF] Inserted {n_segments} segmentation rows
         in {segmentation_insert_time:.3f}s"""
    )
    logger.info(f'Inserted {n_segments} segmentation rows for dataset {ds_id} (job {job_id})')

    # 3. Populate segmentation_ion_profile
    segment_profiles = result.get('segment_profiles') or []
    if segment_profiles:
        ann_rows = db.select_with_fields(
            '''SELECT m.id, m.formula, m.chem_mod, m.neutral_loss, m.adduct
               FROM annotation m
               JOIN job j ON j.id = m.job_id
               WHERE j.ds_id = %s AND m.iso_image_ids[1] IS NOT NULL''',
            (ds_id,),
        )
        label_to_ann_id = {}
        for row in ann_rows:
            label = format_ion_formula(
                row['formula'], row['chem_mod'], row['neutral_loss'], row['adduct']
            )
            label_to_ann_id.setdefault(label, row['id'])

        seg_uuid_map = {seg_idx: seg_uuids[seg_idx] for seg_idx in range(n_segments)}

        profile_rows = []
        skipped = 0
        for rec in segment_profiles:
            seg_idx = rec['segment_id']
            ion = rec['ion_label']
            score = rec['enrich_score']
            if (
                ion not in label_to_ann_id
                or score is None
                or (isinstance(score, float) and math.isnan(score))
            ):
                skipped += 1
                continue
            profile_rows.append(
                (
                    seg_uuid_map[seg_idx],
                    label_to_ann_id[ion],
                    float(score),
                )
            )

        if profile_rows:
            profile_insert_start = time.time()
            db.insert(
                '''INSERT INTO segmentation_ion_profile
                 (segmentation_id, annotation_id, enrich_score)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (segmentation_id, annotation_id) DO NOTHING''',
                profile_rows,
            )
            profile_insert_time = time.time() - profile_insert_start
            logger.info(
                f"""[SEGMENTATION_PERF] Inserted {len(profile_rows)}
                 ion profiles in {profile_insert_time:.3f}s"""
            )
        logger.info(
            f'Inserted {len(profile_rows)} segmentation_ion_profile rows for dataset {ds_id}'
            f' ({skipped} skipped — missing annotation or NaN score)'
        )

    # 4. Replace the previous finished job(s) of the same slot; cleanup must never block the result.
    # Safe to retry: a job already deleted is a no-op and S3 deletes are idempotent.
    for old_id in _replaced_job_ids(db, ds_id, job_id, is_default, user_id):
        try:
            delete_segmentation_job(ds_id, old_id, db)
        except Exception as e:  # pylint: disable=broad-except
            logger.warning(
                f'Failed to delete replaced segmentation job {old_id} for dataset {ds_id}: {e}'
            )

    # 5. Mark job finished
    job_finish_start = time.time()
    db.alter(
        "UPDATE image_segmentation_job SET status = 'FINISHED', updated_at = NOW() WHERE id = %s",
        params=(job_id,),
    )
    job_finish_time = time.time() - job_finish_start

    total_save_time = time.time() - save_start_time
    logger.info(f'[SEGMENTATION_PERF] Job marked as FINISHED in {job_finish_time:.3f}s')
    logger.info(
        f"""[SEGMENTATION_PERF] save_segmentation_result completed
         in {total_save_time:.3f}s for dataset {ds_id}"""
    )
    logger.info(f'Segmentation result saved for dataset {ds_id} (job {job_id})')


def del_segmentation_job_images(ds_id: str, db) -> None:
    """Delete the label-map images of every segmentation job of a dataset.

    Args:
        ds_id: Dataset ID.
        db: Database wrapper.
    """
    rows = db.select(
        'SELECT label_map_image_id FROM image_segmentation_job '
        'WHERE ds_id = %s AND label_map_image_id IS NOT NULL',
        (ds_id,),
    )
    image_ids = [row[0] for row in rows]
    if image_ids:
        image_storage.delete_images(image_storage.DIAG, ds_id, image_ids)


def delete_segmentation_job(ds_id: str, job_id: int, db) -> None:
    """Delete a segmentation job, its label-map image and (cascading) its segments.

    A job that does not exist for the dataset is a no-op.

    Args:
        ds_id: Dataset ID.
        job_id: Segmentation job ID.
        db: Database wrapper.
    """
    row = db.select_one(
        'SELECT label_map_image_id FROM image_segmentation_job WHERE id = %s AND ds_id = %s',
        (job_id, ds_id),
    )
    if not row:
        return
    (image_id,) = row
    # Row first: a failure afterwards leaves an orphan S3 object, not a job whose image 404s
    db.alter('DELETE FROM image_segmentation_job WHERE id = %s', (job_id,))
    if image_id:
        image_storage.delete_image(image_storage.DIAG, ds_id, image_id)
