import logging
import time
from typing import Dict

import bottle  # pylint: disable=import-error

from sm.engine.db import DB
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR
from sm.rest.diff_roi_manager import DiffROIManager

sm_config: Dict
logger = logging.getLogger('api')
app = bottle.Bottle()


def init(sm_config_):
    global sm_config  # pylint: disable=global-statement
    sm_config = sm_config_


def _create_diff_roi_manager(db):
    return DiffROIManager(db=db)


def sm_modify_diff_roi(request_name):
    def _modify(handler):
        def _func():
            try:
                params = body_to_json(bottle.request)
                logger.info(f'Received {request_name} request: {params}')
                diff_roi_man = _create_diff_roi_manager(DB())
                res = handler(diff_roi_man, params)
                return {'status': OK['status'], 'ds_id': res.get('ds_id', None)}
            except Exception as e:
                logger.exception(f'{bottle.request} - {e}')
                return make_response(INTERNAL_ERROR)

        return _func

    return _modify


@app.post('/compareROIs')
@sm_modify_diff_roi('COMPARE_ROIS')
def compare_rois(diff_roi_man, params):
    """
    :param diff_roi_man: DiffROIManager
    :param params: {
        ds_id
        TIC_normalize
        log_transform_tic
        chunk_size
        n_pixel_samples
    }
    """
    ds_id = params['ds_id']
    start = time.time()
    comp_roi_result = diff_roi_man.run_diff_roi(
        ds_id=ds_id,
        tic_normalize=params.get('TIC_normalize', True),
        log_transform_tic=params.get('log_transform_tic', True),
        chunk_size=params.get('chunk_size', 100),
        n_pixel_samples=params.get('n_pixel_samples', 10000),
    )
    logger.info(f'Completed diff ROI in {round(time.time() - start, 2)} sec')

    diff_roi_man.save_diff_roi_results(ds_id, comp_roi_result)
    logger.info(f'Saved diff ROI results for dataset {ds_id}')

    return {'status': 'success'}
