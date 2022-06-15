import io
import logging

import bottle
import PIL
import numpy as np
from matplotlib import pyplot as plt

from sm.rest.imzml_browser_manager import DatasetBrowser
from sm.rest.utils import body_to_json, make_response, INTERNAL_ERROR


logger = logging.getLogger('api')
app = bottle.Bottle()


def create_mz_image(mz_peaks, coordinates):
    min_x, min_y = np.amin(coordinates, axis=0)
    max_x, max_y = np.amax(coordinates, axis=0)
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1

    alpha = np.zeros(shape=(nrows, ncols))
    all_xs, all_ys = zip(*coordinates)
    all_xs -= min_x
    all_ys -= min_y
    alpha[all_ys, all_xs] = 1

    image_coord_idxs = mz_peaks[:, 2].astype('i')
    xs = all_xs[image_coord_idxs]
    ys = all_ys[image_coord_idxs]
    mz_image = np.zeros(shape=(nrows, ncols))
    np.add.at(mz_image, [ys, xs], mz_peaks[:, 1])  # warning
    if mz_image.max() > 0:
        mz_image /= mz_image.max()

    return mz_image, alpha


def create_rgba_image(mz_image, alpha):
    rgba_image = plt.get_cmap('gray')(mz_image)
    rgba_image[:, :, 3] = alpha
    return rgba_image


def create_png_image(rgba_image):
    image = PIL.Image.fromarray((rgba_image * 255).astype(np.uint8), mode='RGBA')
    fp = io.BytesIO()
    image.save(fp, format='PNG')
    fp.seek(0)
    return fp


@app.post('/search')
def get_intensity_by_mz_ppm():
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Received `search` request: {params}')
        assert params.get('ds_id')
        assert params.get('mz_low')
        assert params.get('mz_high')

        ds = DatasetBrowser(params['ds_id'], params['mz_low'], params['mz_high'])

        mz_image, alpha = create_mz_image(ds.mz_peaks, ds.coordinates)
        rgba_image = create_rgba_image(mz_image, alpha)
        body = create_png_image(rgba_image)
        headers = {'Content-Type': 'image/png'}
        return bottle.HTTPResponse(body, **headers)
    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)
