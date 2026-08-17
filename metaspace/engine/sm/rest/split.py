import logging
from typing import Dict

import bottle

from sm.engine.db import DB
from sm.rest.split_manager import SplitManager
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR

sm_config: Dict
logger = logging.getLogger('api')
app = bottle.Bottle()


def init(sm_config_):
    global sm_config  # pylint: disable=global-statement
    sm_config = sm_config_


def _create_split_manager(db):
    return SplitManager(db=db)


def sm_modify_split(request_name):
    def _modify(handler):
        def _func():
            try:
                params = body_to_json(bottle.request)
                logger.info(f'Received {request_name}: {params}')
                split_man = _create_split_manager(DB())
                res = handler(split_man, params)
                return {'status': OK['status'], **res}
            except Exception as e:
                logger.exception(f'{bottle.request} - {e}')
                return make_response(INTERNAL_ERROR)

        return _func

    return _modify


@app.post('/run')
@sm_modify_split('RUN')
def run_split(split_man, params):
    """Queue a dataset-split job whose rows sm-graphql has already created.

    Expected JSON body:
    {
        "job_id":       int,
        "use_lithops":  bool  (default false)
    }
    """
    job_id = params.get('job_id')
    if not job_id:
        raise Exception('Missing required parameter: job_id')

    return split_man.run_split(job_id=job_id, use_lithops=params.get('use_lithops', False))


@app.post('/roi-stats')
@sm_modify_split('ROI_STATS')
def roi_stats(split_man, params):
    """Per-ROI pixel counts used by the split dialog and validated again on submit.

    Expected JSON body:
    {
        "ds_id":    str,
        "roi_ids":  [int] | null
    }
    """
    ds_id = params.get('ds_id')
    if not ds_id:
        raise Exception('Missing required parameter: ds_id')

    return split_man.roi_stats(ds_id=ds_id, roi_ids=params.get('roi_ids'))


@app.post('/restart_pending')
@sm_modify_split('RESTART_PENDING_JOBS')
def restart_pending_jobs(split_man, params):  # pylint: disable=unused-argument
    """Restart split jobs left pending by a service restart."""
    return split_man.restart_pending_jobs()
