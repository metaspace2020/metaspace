"""Bottle sub-app for the stats_analysis microservice.

The umbrella server mounts this app under ``/experiment`` and owns config
loading, port binding, and ``MEMFILE_MAX``. This module exposes only the
routes (``POST /run``, ``GET /health``).
"""
import logging
import threading

import bottle
import requests

from stats_analysis.pipeline import run_experiment

logger = logging.getLogger(__name__)

app = bottle.Bottle()


def _do_run(experiment_id, run_generation, payload, callback_url, email):
    try:
        result = run_experiment(experiment_id, run_generation, payload)
        body = {
            'experiment_id': experiment_id,
            'run_generation': run_generation,
            'status': 'FINISHED',
            'result': result,
        }
        if email:
            body['email'] = email
        resp = requests.post(callback_url, json=body, timeout=30)
        logger.info(
            'Pipeline finished for experiment %s gen=%s; callback %s -> %s',
            experiment_id, run_generation, callback_url, resp.status_code,
        )
    except Exception as e:  # pylint: disable=broad-except
        logger.exception(
            'Mock pipeline failed for experiment %s gen %s', experiment_id, run_generation
        )
        try:
            failure = {
                'experiment_id': experiment_id,
                'run_generation': run_generation,
                'status': 'FAILED',
                'error': str(e),
            }
            if email:
                failure['email'] = email
            requests.post(callback_url, json=failure, timeout=30)
        except Exception:  # pylint: disable=broad-except
            logger.exception(
                'Callback POST failed for experiment %s gen %s',
                experiment_id,
                run_generation,
            )


@app.post('/run')
def run():
    payload = bottle.request.json or {}

    required = ('experiment_id', 'callback_url')
    missing = [k for k in required if not payload.get(k)]
    if payload.get('run_generation') is None:
        missing.append('run_generation')
    if missing:
        bottle.response.status = 400
        return {'status': 'error', 'error': f'missing required fields: {missing}'}

    experiment_id = payload['experiment_id']
    run_generation = payload['run_generation']
    callback_url = payload['callback_url']
    email = payload.get('email')

    logger.info(
        'Accepted stats_analysis run for experiment %s gen=%s',
        experiment_id,
        run_generation,
    )

    threading.Thread(
        target=_do_run,
        args=(experiment_id, run_generation, payload, callback_url, email),
        daemon=True,
    ).start()

    bottle.response.status = 202
    return {
        'status': 'accepted',
        'experiment_id': experiment_id,
        'run_generation': run_generation,
    }


@app.get('/health')
def health():
    return {'status': 'ok'}


from stats_analysis.pipeline import run_experiment_stats_only  # noqa: E402


def _do_stats_only(experiment_id, run_generation, payload, callback_url):
    try:
        result = run_experiment_stats_only(experiment_id, run_generation, payload)
        body = {
            'experiment_id': experiment_id,
            'run_generation': run_generation,
            'status': 'FINISHED',
            'result': result,
        }
        resp = requests.post(callback_url, json=body, timeout=30)
        logger.info(
            'Stats-only finished for experiment %s gen=%s; callback %s -> %s',
            experiment_id, run_generation, callback_url, resp.status_code,
        )
    except Exception as e:  # pylint: disable=broad-except
        logger.exception(
            'Stats-only failed for experiment %s gen %s', experiment_id, run_generation,
        )
        try:
            requests.post(callback_url, json={
                'experiment_id': experiment_id,
                'run_generation': run_generation,
                'status': 'FAILED',
                'error': str(e),
            }, timeout=30)
        except Exception:  # pylint: disable=broad-except
            logger.exception(
                'Callback POST failed for stats-only %s gen %s',
                experiment_id, run_generation,
            )


@app.post('/run_stats')
def run_stats():
    payload = bottle.request.json or {}
    required = ('experiment_id', 'callback_url', 'intensity_blob_s3_key')
    missing = [k for k in required if not payload.get(k)]
    if payload.get('run_generation') is None:
        missing.append('run_generation')
    if missing:
        bottle.response.status = 400
        return {'status': 'error', 'error': f'missing required fields: {missing}'}

    experiment_id = payload['experiment_id']
    run_generation = payload['run_generation']
    callback_url = payload['callback_url']

    logger.info(
        'Accepted stats-only run for experiment %s gen=%s',
        experiment_id, run_generation,
    )
    threading.Thread(
        target=_do_stats_only,
        args=(experiment_id, run_generation, payload, callback_url),
        daemon=True,
    ).start()
    bottle.response.status = 202
    return {
        'status': 'accepted',
        'experiment_id': experiment_id,
        'run_generation': run_generation,
    }
