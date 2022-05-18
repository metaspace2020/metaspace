import argparse
import logging

import bottle

from sm.engine.util import GlobalInit
from sm.rest import isotopic_pattern, datasets, databases
from sm.rest.utils import body_to_json, make_response, OK, INTERNAL_ERROR

logger = logging.getLogger('api')

app = bottle.Bottle()
app.mount('/v1/datasets/', datasets.app)
app.mount('/v1/databases/', databases.app)


@app.get('/')
def root():
    return make_response(OK)


import numpy as np
from matplotlib import pyplot as plt

from sm.engine.config import SMConfig
from sm.engine.db import DB, ConnectionPool
from sm.engine.storage import get_s3_client

import io
import PIL
from bottle import HTTPResponse
from matplotlib import pyplot as plt


# TODO:
#  * basket name


class DatasetFiles:
    """Class for accessing to imzml browser files"""

    DS_SEL = 'SELECT input_path FROM dataset WHERE id = %s'

    def __init__(self, ds_id):
        self.ds_id = ds_id

        self._db = DB()
        self._sm_config = SMConfig.get_conf()
        self.s3_client = get_s3_client(sm_config=self._sm_config)

        self.bucket, self.uuid = self._get_bucket_and_uuid()

        self.ds_coordinates_key = f'{self.uuid}/coordinates.bin'
        self.mz_index_key = f'{self.uuid}/mz_index.bin'
        self.mz_sorted_peaks_key = f'{self.uuid}/peaks_sorted_by_mz.bin'

    def _get_bucket_and_uuid(self):
        with ConnectionPool(self._sm_config['db']):
            # add exception for non existed ds_id
            res = self._db.select_one(DatasetFiles.DS_SEL, params=(self.ds_id,))
            uuid = res[0].split('/')[-1]
            bucket = res[0].split('/')[-2]

        return bucket, uuid

    def read_coordinates(self) -> bytes:
        s3_object = self.s3_client.get_object(Bucket=self.bucket, Key=self.ds_coordinates_key)
        return s3_object['Body'].read()

    def read_mz_index(self) -> bytes:
        s3_object = self.s3_client.get_object(Bucket=self.bucket, Key=self.mz_index_key)
        return s3_object['Body'].read()

    def read_mz_peaks(self, offset, bytes_to_read):
        s3_object = self.s3_client.get_object(
            Bucket=self.bucket,
            Key=self.mz_sorted_peaks_key,
            Range=f'bytes={offset}-{offset + bytes_to_read - 1}',
        )
        return s3_object['Body'].read()


class DatasetBrowser:
    def __init__(self, ds_id, mz_low, mz_high):
        self.ds_id = ds_id
        self.mz_low = mz_low
        self.mz_high = mz_high

        self.ds_files = DatasetFiles(ds_id)

        self.coordinates = np.frombuffer(self.ds_files.read_coordinates(), dtype='i').reshape(-1, 2)
        self.mz_index = np.frombuffer(self.ds_files.read_mz_index(), dtype='f')

        self.mz_peaks = self.get_mz_peaks()

    def get_mz_peaks(self):
        mz_low_chunk_idx, mz_high_chunk_idx = np.searchsorted(
            self.mz_index, [self.mz_low, self.mz_high]
        )
        if mz_high_chunk_idx == 0:
            return np.zeros((0, 3), dtype='f')

        # previous chunk actually includes value
        mz_low_chunk_idx -= 1

        chunk_size = 3 * 4 * 1024  # num of elements, element in bytes, chunk record size
        offset = mz_low_chunk_idx * chunk_size
        bytes_to_read = (mz_high_chunk_idx - mz_low_chunk_idx + 1) * chunk_size
        mz_chunks_array = np.frombuffer(
            self.ds_files.read_mz_peaks(offset, bytes_to_read), dtype='f'
        ).reshape(-1, 3)

        index_low, index_high = np.searchsorted(mz_chunks_array[:, 0], [self.mz_low, self.mz_high])
        # index_high equals to index after last (?)
        mz_peaks = mz_chunks_array[index_low:index_high]

        return mz_peaks


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


@app.post('/v1/imzml_browser/search')
def get_intensity_by_mz_ppm():
    try:
        logger.info('TEST')
        params = body_to_json(bottle.request)
        ds_id = params.get('ds_id')
        mz_low = params.get('mz_low')
        mz_high = params.get('mz_high')
        assert ds_id
        assert mz_low
        assert mz_high

        ds = DatasetBrowser(ds_id, mz_low, mz_high)

        mz_image, alpha = create_mz_image(ds.mz_peaks, ds.coordinates)
        rgba_image = create_rgba_image(mz_image, alpha)
        body = create_png_image(rgba_image)
        headers = {'Content-Type': 'image/png'}
        return HTTPResponse(body, **headers)
    except Exception as e:
        logger.error(f'{bottle.request} - {e}')


@app.get('/v1/isotopic_patterns/<ion>/<instr>/<res_power>/<at_mz>/<charge>')
def generate(ion, instr, res_power, at_mz, charge):
    try:
        pattern = isotopic_pattern.generate(ion, instr, res_power, at_mz, charge)
        return make_response(OK, data=pattern)
    except Exception as e:
        logger.warning(f'({ion}, {instr}, {res_power}, {at_mz}, {charge}) - {e}')
        return make_response(INTERNAL_ERROR)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM Engine REST API')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', type=str, help='SM config path'
    )
    args = parser.parse_args()

    with GlobalInit(args.config_path) as sm_config:
        datasets.init(sm_config)
        logger.info('Starting SM api')
        app.run(**sm_config['bottle'])
