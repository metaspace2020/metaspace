import logging
from typing import Dict

import bottle

from sm.engine.db import DB
from sm.rest.segmentation_manager import SegmentationManager
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR

sm_config: Dict
logger = logging.getLogger('api')
app = bottle.Bottle()


def init(sm_config_):
    global sm_config  # pylint: disable=global-statement
    sm_config = sm_config_


def _create_segmentation_manager(db):
    return SegmentationManager(db=db)


def sm_modify_segmentation(request_name):
    def _modify(handler):
        def _func():
            try:
                params = body_to_json(bottle.request)
                logger.info(
                    f'Received {request_name}: {params if request_name != "CALLBACK" else ""}'
                )
                segmentation_man = _create_segmentation_manager(DB())
                res = handler(segmentation_man, params)
                return {
                    'status': OK['status'],
                    'job_id': res.get('job_id', None),
                    'ds_id': res.get('ds_id', None),
                }
            except Exception as e:
                logger.exception(f'{bottle.request} - {e}')
                return make_response(INTERNAL_ERROR)

        return _func

    return _modify


@app.post('/run')
@sm_modify_segmentation('RUN')
def run_segmentation(segmentation_man, params):
    """Accept a segmentation request, persist a QUEUED job, and enqueue it.

    Expected JSON body:
    {
        "ds_id":      str,
        "algorithm":  str           (default "pca_gmm"),
        "database_ids":  [int]  (default []),
        "fdr":        float         (default 0.2),
        "params":     dict          (default {}),
        "adducts":    [str] | null,
        "min_mz":     float | null,
        "max_mz":     float | null,
        "off_sample": bool | null  (default null = no filter),
        "email":      str | null
    }
    """
    ds_id = params.get('ds_id')
    if not ds_id:
        raise Exception('Missing required parameter: ds_id')

    algorithm = params.get('algorithm', 'pca_gmm')
    database_ids = params.get('database_ids', [])
    fdr = float(params.get('fdr', 0.2))
    seg_params = params.get('params', {})
    adducts = params.get('adducts')
    min_mz = params.get('min_mz')
    max_mz = params.get('max_mz')
    off_sample = params.get('off_sample')
    email = params.get('email')

    result = segmentation_man.run_segmentation(
        ds_id=ds_id,
        algorithm=algorithm,
        database_ids=database_ids,
        fdr=fdr,
        params=seg_params,
        adducts=adducts,
        min_mz=min_mz,
        max_mz=max_mz,
        off_sample=off_sample,
        email=email,
    )

    return result


@app.post('/restart_pending')
@sm_modify_segmentation('RESTART_PENDING_JOBS')
def restart_pending_jobs(segmentation_man, params):
    """Restart all pending segmentation jobs after service restart."""
    result = segmentation_man.restart_pending_jobs()
    return result


@app.post('/callback')
@sm_modify_segmentation('CALLBACK')
def segmentation_callback(segmentation_man, params):
    """Receive async result from the segmentation microservice."""
    job_id = params.get('job_id')
    ds_id = params.get('ds_id')

    if not job_id or not ds_id:
        raise Exception('Missing required parameters: job_id and ds_id')

    status = params.get('status')
    result = params.get('result')
    error = params.get('error')
    email = params.get('email')

    result = segmentation_man.handle_segmentation_callback(
        job_id=job_id,
        ds_id=ds_id,
        status=status,
        result=result,
        error=error,
        email=email,
    )

    return result
