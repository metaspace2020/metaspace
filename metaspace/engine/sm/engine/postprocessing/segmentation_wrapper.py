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


def run_segmentation_for_dataset(
    ds_id, job_id, algorithm, databases, fdr, params, db, services_config,
    adducts=None, min_mz=None, max_mz=None, off_sample=False
):
    """Prepare segmentation input, call the microservice, and save results to the DB.

    Args:
        ds_id:            dataset ID string
        job_id:           image_segmentation_job.id to update
        algorithm:        segmentation algorithm name (e.g. 'pca_gmm')
        databases:        list of [name, version] pairs, e.g. [["HMDB", "v4"]]
        fdr:              FDR threshold (float)
        params:           algorithm-specific parameters dict
        db:               DB instance
        services_config:  services section of sm_config
        adducts:          optional list of adduct strings to keep
        min_mz:           optional lower m/z bound applied against theo_mz
        max_mz:           optional upper m/z bound applied against theo_mz
        off_sample:       False = on-sample only (default), True = off-sample only, None = all
    """
    segmentation_endpoint = services_config['segmentation']

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

    logger.info(f'Calling segmentation service for dataset {ds_id} (job {job_id})')

    resp = requests.post(
        f'{segmentation_endpoint}/run',
        json={
            'dataset_id': ds_id,
            'algorithm': algorithm,
            'input_s3_key': input_s3_key,
            'parameters': params,
        },
        timeout=(30, 600),  # 30 s connect, 600 s read
    )
    resp.raise_for_status()

    body = resp.json()
    if body.get('status') != 'ok':
        raise RuntimeError(
            f"Segmentation service returned error: {body.get('error', 'unknown error')}"
        )

    result = body['result']

    # 2. Save label_map as NPY in dataset_diagnostic
    label_map = np.array(result['label_map'], dtype=np.int32)
    label_map_image = save_diagnostic_image(
        ds_id, label_map, key=DiagnosticImageKey.LABEL_MAP, fmt=DiagnosticImageFormat.NPY
    )

    add_diagnostics([{
        'ds_id': ds_id,
        'job_id': job_id,
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

    # 3. Insert one segmentation row per segment; let DB generate UUIDs
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

    # 4. Populate segmentation_ion_profile from the long segment_profiles list
    segment_profiles = result.get('segment_profiles') or []
    if segment_profiles:
        # Build ion_label → annotation.id map for this dataset
        ann_rows = db.select_with_fields(
            '''SELECT m.id, m.formula, m.chem_mod, m.neutral_loss, m.adduct
               FROM annotation m
               JOIN job j ON j.id = m.job_id
               WHERE j.ds_id = %s AND m.iso_image_ids[0] IS NOT NULL''',
            (ds_id,),
        )
        label_to_ann_id = {}
        for row in ann_rows:
            label = format_ion_formula(
                row['formula'], row['chem_mod'], row['neutral_loss'], row['adduct']
            )
            label_to_ann_id.setdefault(label, row['id'])

        # seg_uuids is ordered by segment_index (0, 1, 2, ...)
        seg_uuid_map = {seg_idx: seg_uuids[seg_idx] for seg_idx in range(n_segments)}

        profile_rows = []
        skipped = 0
        for rec in segment_profiles:
            seg_idx = rec['segment_id']
            ion = rec['ion_label']
            score = rec['enrich_score']
            if ion not in label_to_ann_id or (isinstance(score, float) and math.isnan(score)):
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

    # 5. Mark job finished
    db.alter(
        "UPDATE image_segmentation_job SET status = 'FINISHED', updated_at = NOW() WHERE id = %s",
        params=(job_id,),
    )

    logger.info(f'Segmentation result saved for dataset {ds_id} (job {job_id})')
