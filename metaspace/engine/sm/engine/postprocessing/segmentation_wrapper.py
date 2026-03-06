import json
import logging

import requests

logger = logging.getLogger('update-daemon')


def run_segmentation_for_dataset(
    ds_id, job_id, algorithm, databases, fdr, params, db, services_config,
    adducts=None, min_mz=None, max_mz=None, off_sample=False
):
    """Call the segmentation microservice and save results to the DB.

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
        min_mz:           optional lower m/z bound
        max_mz:           optional upper m/z bound
        off_sample:       False = on-sample only (default), True = off-sample only, None = all
    """
    segmentation_endpoint = services_config['segmentation']

    logger.info(f'Calling segmentation service for dataset {ds_id} (job {job_id})')

    body = {
        'dataset_id': ds_id,
        'algorithm': algorithm,
        'databases': databases,
        'fdr': fdr,
        'parameters': params,
    }
    if adducts is not None:
        body['adducts'] = adducts
    if min_mz is not None:
        body['min_mz'] = min_mz
    if max_mz is not None:
        body['max_mz'] = max_mz
    if off_sample is not None:
        body['off_sample'] = off_sample

    resp = requests.post(
        f'{segmentation_endpoint}/run',
        json=body,
        timeout=(30, 600),  # 30 s connect, 600 s read
    )
    resp.raise_for_status()

    body = resp.json()
    if body.get('status') != 'ok':
        raise RuntimeError(
            f"Segmentation service returned error: {body.get('error', 'unknown error')}"
        )

    result = body['result']

    # TODO: before writing, extract result['label_map'] and result['segment_profiles'],
    # upload them as NPY/parquet files to S3, replace with S3 keys in the result dict,
    # so the DB row stays small regardless of dataset size.
    db.alter(
        '''UPDATE image_segmentation_job
               SET status = %s, result = %s::jsonb, updated_at = NOW()
             WHERE id = %s''',
        params=('FINISHED', json.dumps(result), job_id),
    )

    logger.info(f'Segmentation result saved for dataset {ds_id} (job {job_id})')
