import io
import logging
import time
import base64

import bottle

from sm.rest.utils import body_to_json, make_response, INTERNAL_ERROR
from sm.rest.diff_roi_manager import run_diff_roi

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
                                       chunk_size=params.get('chunk_size', 1000),
                                       n_pixel_samples=params.get('n_pixel_samples', 10000))
        logger.info(f'Completed diff ROI in {round(time.time() - start, 2)} sec')
        headers = {'Content-Type': 'application/json'}
        body = {'diff_roi_result': comp_roi_result}
        return bottle.HTTPResponse(body, **headers)
    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)