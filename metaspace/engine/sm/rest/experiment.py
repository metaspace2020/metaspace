"""REST endpoints for experiment statistical-analysis runs.

Two endpoints under ``/v1/experiment/`` (mount in :mod:`sm.rest.api`):

* ``POST /run`` — kick off a new (re-)run; engine bumps run_generation.
* ``POST /callback`` — receive a result from the stats microservice.
"""

import logging
from typing import Dict

import bottle

from sm.engine.db import DB
from sm.rest.experiment_manager import ExperimentManager
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR

sm_config: Dict
logger = logging.getLogger('api')
app = bottle.Bottle()


def init(sm_config_):
    """Stash the SM config for later use by handlers."""
    global sm_config  # pylint: disable=global-statement
    sm_config = sm_config_


def sm_modify_experiment(request_name):
    """Decorator that wraps a handler with logging + error handling."""

    def _modify(handler):
        def _func():
            try:
                params = body_to_json(bottle.request)
                # CALLBACK bodies can be large; log just the request name.
                logger.info(
                    f'Received {request_name}: {params if request_name != "CALLBACK" else ""}'
                )
                res = handler(ExperimentManager(db=DB()), params)
                return {
                    'status': OK['status'],
                    'experiment_id': res.get('experiment_id'),
                    'run_generation': res.get('run_generation'),
                }
            except Exception as e:  # pylint: disable=broad-except
                logger.exception(f'{bottle.request} - {e}')
                return make_response(INTERNAL_ERROR)

        return _func

    return _modify


def _require(params, *names):
    for name in names:
        if params.get(name) is None or params.get(name) == '':
            raise Exception(f'Missing required parameter: {name}')


@app.post('/run')
@sm_modify_experiment('RUN')
def run_experiment(experiment_man, params):
    """Kick off an experiment statistical-analysis run.

    Body: ``{ experiment_id: str, run_generation: int, email?: str }``
    """
    _require(params, 'experiment_id', 'run_generation')
    return experiment_man.run_experiment(
        experiment_id=params['experiment_id'],
        run_generation=int(params['run_generation']),
        email=params.get('email'),
    )


@app.post('/run_stats')
@sm_modify_experiment('RUN_STATS')
def run_experiment_stats(experiment_man, params):
    """Kick off a stats-only re-run that reuses the persisted intensity blob.

    Body: ``{ experiment_id: str, run_generation: int, filter: dict, excluded_samples: list[str] }``
    """
    _require(params, 'experiment_id', 'run_generation')
    return experiment_man.run_stats_only(
        experiment_id=params['experiment_id'],
        run_generation=int(params['run_generation']),
        filter=params.get('filter') or {},
        excluded_samples=params.get('excluded_samples') or [],
    )


@app.get('/<experiment_id>/ion/<ion_id:int>/intensities')
def get_ion_intensities(experiment_id, ion_id):
    """Return per-region intensities for one ion of an experiment.

    Reads the gzipped JSON blob for the experiment's current ``run_generation``
    from S3, filters by ``ion_id``, and enriches each row with the region's
    sample metadata. Returns ``{"rows": [...]}``; an empty list when the blob
    is missing (e.g. legacy experiments). Auth is left to the upstream
    GraphQL layer (mirrors the rest of this module — ``/run`` and
    ``/callback`` are also unauthenticated here).
    """
    try:
        logger.info(
            f'Received `experiment ion intensities` request '
            f'experiment={experiment_id} ion={ion_id}'
        )
        man = ExperimentManager(db=DB())
        body = man.get_ion_intensities(experiment_id, int(ion_id))
        headers = {'Content-Type': 'application/json'}
        return bottle.HTTPResponse(body, **headers)
    except Exception as e:  # pylint: disable=broad-except
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)


@app.post('/restart_pending')
def restart_pending(experiment_man=None, params=None):  # pylint: disable=unused-argument
    """Republish pending experiment_stats jobs (called by stats_analysis on startup)."""
    try:
        logger.info('Received experiment restart_pending request')
        man = ExperimentManager(db=DB())
        return man.restart_pending_jobs()
    except Exception as e:  # pylint: disable=broad-except
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)


@app.post('/callback')
@sm_modify_experiment('CALLBACK')
def experiment_callback(experiment_man, params):
    """Receive an async result from the stats_analysis microservice."""
    _require(params, 'experiment_id', 'run_generation', 'status')
    return experiment_man.handle_experiment_callback(
        experiment_id=params['experiment_id'],
        run_generation=int(params['run_generation']),
        status=params['status'],
        result=params.get('result'),
        error=params.get('error'),
        email=params.get('email'),
    )
