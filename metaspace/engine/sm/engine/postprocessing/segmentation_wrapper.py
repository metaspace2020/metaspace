import logging
import math

import numpy as np
import requests

from sm.engine.annotation.diagnostics import (
    DiagnosticImageFormat,
    DiagnosticImageKey,
    DiagnosticType,
    add_diagnostics,
    save_diagnostic_image,
)
from sm.engine.formula_parser import format_ion_formula
from sm.engine.postprocessing.segmentation_data_loader import SegmentationDataLoader

logger = logging.getLogger('update-daemon')


def submit_segmentation_job(  # pylint: disable=too-many-arguments
    ds_id,
    job_id,
    algorithm,
    databases,
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
    segmentation_endpoint = services_config['segmentation']
    callback_url = services_config['segmentation_callback']

    # 1. Load ion images from DB/S3, TIC-normalise, and upload input arrays to S3
    logger.info(f'Loading segmentation data for dataset {ds_id}, job {job_id}')
    try:
        loader = SegmentationDataLoader(ds_id, db)
        input_s3_key = loader.prepare_segmentation_input(
            databases=databases,
            fdr=fdr,
            adducts=adducts,
            off_sample=off_sample,
            min_mz=min_mz,
            max_mz=max_mz,
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
        resp = requests.post(
            f'{segmentation_endpoint}/run',
            json=payload,
            timeout=30,
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

    logger.info(f'Segmentation job {job_id} accepted by service for dataset {ds_id}')


def save_segmentation_result(ds_id, job_id, result, db):  # pylint: disable=too-many-locals
    """Save a completed segmentation result to the DB.

    Called from the API callback endpoint when the microservice posts back.
    """
    logger.info(f'Saving segmentation result for dataset {ds_id}, job {job_id}')
    logger.debug(f'Result keys: {list(result.keys())}')

    algorithm = result['algorithm']

    # 1. Save label_map as NPY in dataset_diagnostic
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
    label_map_image = save_diagnostic_image(
        ds_id, label_map, key=DiagnosticImageKey.LABEL_MAP, fmt=DiagnosticImageFormat.NPY
    )

    add_diagnostics(
        [
            {
                'ds_id': ds_id,
                # dataset_diagnostic.job_id references annotation job, not image_segmentation_job
                'job_id': None,
                'type': DiagnosticType.SEGMENTATION,
                'data': {
                    'algorithm': result['algorithm'],
                    'map_type': result['map_type'],
                    'n_segments': result['n_segments'],
                    'parameters_used': result['parameters_used'],
                    'segment_summary': result['segment_summary'],
                    'diagnostics': result['diagnostics'],
                },
                'images': [label_map_image],
            }
        ]
    )

    # 2. Insert one segmentation row per segment; let DB generate UUIDs
    n_segments = result['n_segments']
    seg_uuids = db.insert_return(
        '''INSERT INTO segmentation (dataset_id, job_id, segment_index, algorithm, status)
           VALUES (%s, %s, %s, %s, %s)
           RETURNING id''',
        rows=[(ds_id, job_id, seg_idx, algorithm, 'FINISHED') for seg_idx in range(n_segments)],
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
            db.insert(
                '''INSERT INTO segmentation_ion_profile
                 (segmentation_id, annotation_id, enrich_score)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (segmentation_id, annotation_id) DO NOTHING''',
                profile_rows,
            )
        logger.info(
            f'Inserted {len(profile_rows)} segmentation_ion_profile rows for dataset {ds_id}'
            f' ({skipped} skipped — missing annotation or NaN score)'
        )

    # 4. Mark job finished
    db.alter(
        "UPDATE image_segmentation_job SET status = 'FINISHED', updated_at = NOW() WHERE id = %s",
        params=(job_id,),
    )

    logger.info(f'Segmentation result saved for dataset {ds_id} (job {job_id})')
