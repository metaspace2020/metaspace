import io
import logging
import time
import base64

import bottle
import PIL
import numpy as np
from matplotlib import pyplot as plt

from sm.engine.annotation_lithops.io import deserialize
from sm.rest.imzml_browser_manager import DatasetFiles, DatasetBrowser
from sm.rest.utils import body_to_json, make_response, INTERNAL_ERROR

logger = logging.getLogger('api')
app = bottle.Bottle()


def create_mz_image(mz_peaks, coordinates):
    """Calculate the total intensity for each pixel and normalize the resulting intensity"""
    coordinates = coordinates - np.min(coordinates, axis=0)
    width, height = np.max(coordinates, axis=0) + 1

    # calculate the total intensity of all peaks for each pixel
    mz_image = np.zeros(width * height, dtype='f')
    np.add.at(mz_image, mz_peaks[:, 2].astype(np.int), mz_peaks[:, 1])

    if mz_image.max() > 0:
        mz_image /= mz_image.max()

    alpha = np.ones(shape=(height, width))

    return mz_image.reshape(height, width), alpha, np.max(mz_peaks)


def create_rgba_image(mz_image, alpha):
    rgba_image = plt.get_cmap('gray')(mz_image)
    rgba_image[:, :, 3] = alpha
    return rgba_image


def create_png_image(rgba_image):
    image = PIL.Image.fromarray((rgba_image * 255).astype(np.uint8), mode='RGBA')
    fp = io.BytesIO()
    image.save(fp, format='PNG')
    fp.seek(0)
    img_str = base64.b64encode(fp.getvalue())
    return 'data:image/png;base64,' + img_str.decode()


def get_mzs_ints(x, y, coord_mapping, parser, ds_files):
    precision = {'f': 4, 'd': 8}
    ds_files.find_ibd_key()
    ibd_key = ds_files.ibd_key
    bucket = ds_files.upload_bucket

    if (x, y) in coord_mapping:
        index = coord_mapping[(x, y)]

        mz_offset = parser.mzOffsets[index]
        mz_length = parser.mzLengths[index] * precision[parser.mzPrecision]
        mzs = np.frombuffer(
            ds_files.read_file_partially(mz_offset, mz_length, ibd_key, bucket=bucket),
            dtype=parser.mzPrecision,
        )

        intensity_offset = parser.intensityOffsets[index]
        intensity_length = parser.intensityLengths[index] * precision[parser.intensityPrecision]
        ints = np.frombuffer(
            ds_files.read_file_partially(
                intensity_offset,
                intensity_length,
                ibd_key,
                bucket,
            ),
            dtype=parser.intensityPrecision,
        )

    else:
        mzs, ints = np.array([]), np.array([])

    return mzs, ints


@app.post('/intensity_by_mz')
def get_intensity_by_mz_ppm():
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Received `get_intensity_by_mz` request: {params}')
        ds = DatasetBrowser(params['ds_id'], params['mz_low'], params['mz_high'])

        start = time.time()
        mz_image, alpha, max_int = create_mz_image(ds.mz_peaks, ds.coordinates)
        rgba_image = create_rgba_image(mz_image, alpha)
        body = create_png_image(rgba_image)
        logger.info(f'Creating an image in {round(time.time() - start, 2)} sec')

        headers = {'Content-Type': 'application/json'}
        body = {'image': body, 'max_intensity': str(max_int)}
        return bottle.HTTPResponse(body, **headers)
    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)


@app.post('/peaks_from_pixel')
def get_peaks_from_pixel():
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Received `peaks_from_pixel` request: {params}')
        ds_files = DatasetFiles(params['ds_id'])
        imzml_parser = deserialize(ds_files.read_file(ds_files.portable_spectrum_reader_key))

        coordinates = np.array(imzml_parser.coordinates)[:, :2]
        coordinates -= np.min(coordinates, axis=0)
        coord_mapping = {(c[0], c[1]): i for i, c in enumerate(coordinates)}

        mzs, ints = get_mzs_ints(params['x'], params['y'], coord_mapping, imzml_parser, ds_files)

        headers = {'Content-Type': 'application/json'}
        body = {
            'x': params['x'],
            'y': params['y'],
            'mzs': mzs.tolist(),
            'ints': ints.tolist(),
        }
        return bottle.HTTPResponse(body, **headers)

    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)


@app.get('/files/<dataset_id>')
def check_files(dataset_id):
    try:
        logger.info(f'Received `files` request for {dataset_id} dataset')
        ds_files = DatasetFiles(dataset_id)
        status = ds_files.check_imzml_browser_files()
        headers = {'Content-Type': 'application/json'}
        body = {'is_exist': status}
        return bottle.HTTPResponse(body, **headers)
    except Exception as e:
        logger.warning(e.args[0])
        return make_response(INTERNAL_ERROR)
