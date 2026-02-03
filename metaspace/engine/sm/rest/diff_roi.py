import io
import logging
import time
import base64
import json

import bottle

from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR
from sm.rest.diff_roi_manager import run_diff_roi, save_diff_roi_results

logger = logging.getLogger('api')
app = bottle.Bottle()

@app.post('/compareROIs')
def compare_rois():
    try:
        params = body_to_json(bottle.request)
        ds_id = params['ds_id']

        start = time.time()
        comp_roi_result = run_diff_roi(ds_id= ds_id,
                                       TIC_normalize=params.get('TIC_normalize', True),
                                       log_transform_tic=params.get('log_transform_tic', True),
                                       chunk_size=params.get('chunk_size', 100),
                                       n_pixel_samples=params.get('n_pixel_samples', 10000))
        logger.info(f'Completed diff ROI in {round(time.time() - start, 2)} sec')

        save_diff_roi_results(ds_id=ds_id, comp_roi_df=comp_roi_result)
        logger.info(f'Saved diff ROI results for dataset {ds_id}')
        # body = {'diff_roi_result': comp_roi_result.to_dict(orient='records')}
        return make_response(OK)
    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)