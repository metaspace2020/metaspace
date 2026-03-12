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


def submit_segmentation_job(
    ds_id, job_id, algorithm, databases, fdr, params, db, services_config,
    adducts=None, min_mz=None, max_mz=None, off_sample=False
):
    """Prepare segmentation input, then fire-and-forget to the microservice.

    Returns immediately after the service accepts the job (HTTP 202).
    The service will POST results back to services_config['segmentation_callback']
    when done.
    """
    segmentation_endpoint = services_config['segmentation']
    callback_url = services_config['segmentation_callback']

    # 1. Load ion images from DB/S3, TIC-normalise, and upload input arrays to S3
    loader = SegmentationDataLoader(ds_id, db)
    input_s3_key = loader.prepare_segmentation_input(
        databases=databases,
        fdr=fdr,
        adducts=adducts,
        off_sample=off_sample,
        min_mz=min_mz,
        max_mz=max_mz,
    )

    logger.info(f'Submitting segmentation job {job_id} for dataset {ds_id}')

    resp = requests.post(
        f'{segmentation_endpoint}/run',
        json={
            'dataset_id': ds_id,
            'job_id': job_id,
            'algorithm': algorithm,
            'input_s3_key': input_s3_key,
            'parameters': params,
            'callback_url': callback_url,
        },
        timeout=30,
    )
    if not resp.ok:
        try:
            detail = resp.json().get('error', resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Segmentation service error ({resp.status_code}): {detail}")

    logger.info(f'Segmentation job {job_id} accepted by service for dataset {ds_id}')


def save_segmentation_result(ds_id, job_id, result, db):
    """Save a completed segmentation result to the DB.

    Called from the API callback endpoint when the microservice posts back.
    """
    algorithm = result['algorithm']

    # 1. Save label_map as NPY in dataset_diagnostic
    label_map = np.array(result['label_map'], dtype=np.int32)
    label_map_image = save_diagnostic_image(
        ds_id, label_map, key=DiagnosticImageKey.LABEL_MAP, fmt=DiagnosticImageFormat.NPY
    )

    add_diagnostics([{
        'ds_id': ds_id,
        'job_id': None,  # dataset_diagnostic.job_id references annotation job, not image_segmentation_job
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
    }])

    # 2. Insert one segmentation row per segment; let DB generate UUIDs
    n_segments = result['n_segments']
    seg_uuids = db.insert_return(
        '''INSERT INTO segmentation (dataset_id, job_id, segment_index, algorithm, status)
           VALUES (%s, %s, %s, %s, %s)
           RETURNING id''',
        rows=[
            (ds_id, job_id, seg_idx, algorithm, 'FINISHED')
            for seg_idx in range(n_segments)
        ],
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
            if ion not in label_to_ann_id or score is None or (isinstance(score, float) and math.isnan(score)):
                skipped += 1
                continue
            profile_rows.append((
                seg_uuid_map[seg_idx],
                label_to_ann_id[ion],
                float(score),
            ))

        if profile_rows:
            db.insert(
                '''INSERT INTO segmentation_ion_profile (segmentation_id, annotation_id, enrich_score)
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
