import logging

import bottle

from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.daemons.actions import DaemonAction, DaemonActionStage
from sm.engine.queue import QueuePublisher, SM_UPDATE
from sm.engine.postprocessing.segmentation_wrapper import save_segmentation_result
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR, WRONG_PARAMETERS

logger = logging.getLogger('api')
app = bottle.Bottle()


def _create_update_queue_publisher():
    config = SMConfig.get_conf()
    return QueuePublisher(config['rabbitmq'], SM_UPDATE, logger)


@app.post('/run')
def run_segmentation():
    """Accept a segmentation request, persist a QUEUED job, and enqueue it.

    Expected JSON body:
    {
        "ds_id":      str,
        "algorithm":  str           (default "pca_gmm"),
        "databases":  [[str, str]]  (default [["HMDB", "v4"]]),
        "fdr":        float         (default 0.2),
        "params":     dict          (default {}),
        "adducts":    [str] | null,
        "min_mz":     float | null,
        "max_mz":     float | null,
        "off_sample": bool | null  (default null = no filter),
        "email":      str | null
    }
    """
    try:
        body = body_to_json(bottle.request)
        logger.info(f'Received segmentation request: {body}')

        ds_id = body.get('ds_id')
        if not ds_id:
            return make_response(WRONG_PARAMETERS)

        algorithm = body.get('algorithm', 'pca_gmm')
        databases = body.get('databases', [['HMDB', 'v4']])
        fdr = float(body.get('fdr', 0.2))
        params = body.get('params', {})
        adducts = body.get('adducts')
        min_mz = body.get('min_mz')
        max_mz = body.get('max_mz')
        off_sample = body.get(
            'off_sample'
        )  # None = no filter (off-sample classification may not exist)
        email = body.get('email')

        db = DB()

        # Insert a QUEUED job row and retrieve its id
        job_ids = db.insert_return(
            '''INSERT INTO image_segmentation_job (ds_id, status)
               VALUES (%s, %s)
               RETURNING id''',
            rows=[(ds_id, DaemonActionStage.QUEUED)],
        )
        job_id = job_ids[0]

        # Publish the job to the SM_UPDATE queue for the daemon to pick up
        queue_publisher = _create_update_queue_publisher()
        msg = {
            'action': DaemonAction.SEGMENTATION,
            'ds_id': ds_id,
            'job_id': job_id,
            'algorithm': algorithm,
            'databases': databases,
            'fdr': fdr,
            'params': params,
        }
        if adducts is not None:
            msg['adducts'] = adducts
        if min_mz is not None:
            msg['min_mz'] = min_mz
        if max_mz is not None:
            msg['max_mz'] = max_mz
        msg['off_sample'] = off_sample
        if email:
            msg['email'] = email
        queue_publisher.publish(msg)

        logger.info(f'Segmentation job {job_id} queued for dataset {ds_id}')
        return make_response(OK, job_id=job_id)

    except Exception as e:
        logger.exception(f'Error queuing segmentation job: {e}')
        return make_response(INTERNAL_ERROR)


@app.post('/callback')
def segmentation_callback():
    """Receive async result from the segmentation microservice."""
    try:
        body = body_to_json(bottle.request)
        job_id = body.get('job_id')
        ds_id = body.get('ds_id')

        if not job_id or not ds_id:
            return make_response(WRONG_PARAMETERS)

        db = DB()

        if body.get('status') == 'ok':
            save_segmentation_result(ds_id, job_id, body['result'], db)
        else:
            error = body.get('error', 'unknown error')
            logger.error(f'Segmentation job {job_id} for dataset {ds_id} failed: {error}')
            db.alter(
                "UPDATE image_segmentation_job SET status = 'FAILED', error = %s, updated_at = NOW() WHERE id = %s",
                params=(error, job_id),
            )

        return make_response(OK)

    except Exception as e:
        logger.exception(f'Error handling segmentation callback: {e}')
        return make_response(INTERNAL_ERROR)
