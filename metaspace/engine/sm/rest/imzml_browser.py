import io
import logging

import bottle
import PIL
import numpy as np
from matplotlib import pyplot as plt

from sm.rest.imzml_browser_manager import DatasetFiles, DatasetBrowser
from sm.rest.utils import body_to_json, make_response, INTERNAL_ERROR


logger = logging.getLogger('api')
app = bottle.Bottle()


def create_mz_image(mz_peaks, coordinates):
    """Calculate the total intensity for each pixel and normalize the resulting intensity"""
    coordinates = coordinates - np.min(coordinates, axis=0)
    width, height = np.max(coordinates, axis=0) + 1
    mz_image = np.zeros(width * height, dtype='f')

    # suboptimal option, it is desirable to rewrite using numpy
    for _, intensity, index in mz_peaks:
        mz_image[int(index)] += intensity

    if mz_image.max() > 0:
        mz_image /= mz_image.max()

    # ?
    alpha = np.ones(shape=(height, width))

    return mz_image.reshape(height, width), alpha


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


@app.post('/intensity_by_mz')
def get_intensity_by_mz_ppm():
    try:
        params = body_to_json(bottle.request)
        logger.info(f'Received `get_intensity_by_mz` request: {params}')
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


@app.post('/peaks_from_pixel')
def get_peaks_from_pixel():
    try:
        from sm.engine.annotation_lithops.io import deserialize

        params = body_to_json(bottle.request)
        logger.info(f'Received `peak_from_pixel` request: {params}')
        assert params.get('ds_id')

        ds_files = DatasetFiles(params['ds_id'])
        imzml_parser = deserialize(ds_files.read_portable_spectrum_reader())

        coordinates = np.array(imzml_parser.coordinates)[:, :2]
        coordinates -= np.min(coordinates, axis=0)
        coord_mapping = {(c[0], c[1]): i for i, c in enumerate(coordinates)}

        precision = {'f': 4, 'd': 8}
        if (params['x'], params['y']) in coord_mapping:
            index = coord_mapping[(params['x'], params['y'])]
            mz_offset = imzml_parser.mzOffsets[index]
            mz_length = imzml_parser.mzLengths[index] * precision[imzml_parser.mzPrecision]
            intensity_offset = imzml_parser.intensityOffsets[index]
            intensity_lenght = (
                imzml_parser.intensityLengths[index] * precision[imzml_parser.intensityPrecision]
            )

            s3_object = ds_files.s3_client.get_object(
                Bucket=ds_files.upload_bucket,
                Key=ds_files.ibd_key,
                Range=f'bytes={mz_offset}-{mz_offset + mz_length - 1}',
            )
            mzs = np.frombuffer(s3_object['Body'].read(), dtype=imzml_parser.mzPrecision)

            s3_object = ds_files.s3_client.get_object(
                Bucket=ds_files.upload_bucket,
                Key=ds_files.ibd_key,
                Range=f'bytes={intensity_offset}-{intensity_offset + intensity_lenght - 1}',
            )
            ints = np.frombuffer(s3_object['Body'].read(), dtype=imzml_parser.intensityPrecision)

        else:
            mzs, ints = np.array([]), np.array([])

        headers = {'Content-Type': 'application/json'}
        body = {
            'x': params['x'],
            'y': params['y'],
            'mzs': mzs.tolist(),
            'ints': ints.tolist(),
        }
        return bottle.HTTPResponse(body, **headers)
        # return {'mzs': mz.tolist(), 'ints': intensity.tolist()}

    except Exception as e:
        logger.exception(f'{bottle.request} - {e}')
        return make_response(INTERNAL_ERROR)
