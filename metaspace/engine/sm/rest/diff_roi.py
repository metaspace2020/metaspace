import logging
import time

import bottle  # pylint: disable=import-error

from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR
from sm.rest.diff_roi_manager import DiffROIAnalysis

logger = logging.getLogger('api')
app = bottle.Bottle()


@app.post('/compareROIs')
def compare_rois():
    try:
        params = body_to_json(bottle.request)
        ds_id = params['ds_id']

        start = time.time()
        analysis = DiffROIAnalysis(
            ds_id=ds_id,
            tic_normalize=params.get('TIC_normalize', True),
            log_transform_tic=params.get('log_transform_tic', True),
            chunk_size=params.get('chunk_size', 100),
            n_pixel_samples=params.get('n_pixel_samples', 10000),
        )
        comp_roi_result = analysis.run_diff_roi()
        logger.info(f'Completed diff ROI in {round(time.time() - start, 2)} sec')

        analysis.data.save_diff_roi_results(comp_roi_result)
        logger.info(f'Saved diff ROI results for dataset {ds_id}')
        return make_response(OK)
    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)
