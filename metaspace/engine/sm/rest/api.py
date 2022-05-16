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

from sm.engine.config import SMConfig
from sm.engine.db import DB, ConnectionPool
from sm.engine.storage import get_s3_client


# TODO:
#  * basket name


class DatasetBrowser:
    """Class for representing an ..."""

    DS_SEL = 'SELECT input_path FROM dataset WHERE id = %s'

    def __init__(self, ds_id, mz_low, mz_high):
        self.ds_id = ds_id
        self.mz_low = mz_low
        self.mz_high = mz_high
        # self.logger = logger or logging.getLogger()

        self._sm_config = SMConfig.get_conf()
        self._db = DB()
        self._s3_client = get_s3_client(sm_config=self._sm_config)

        self._uuid = self._get_input_path_uuid()
        self._bucket = self._get_input_path_bucket()

        self._coordinates = self._get_coordinates()
        self._mz_index = self._get_mz_index()
        self.mz_peaks = self._get_mz_peaks()

    def _get_input_path_uuid(self):
        with ConnectionPool(self._sm_config['db']):
            # add exception for non existed ds_id
            res = self._db.select_one(DatasetBrowser.DS_SEL, params=(self.ds_id,))
            uuid = res[0].split('/')[-1]

        return uuid

    def _get_input_path_bucket(self):
        with ConnectionPool(self._sm_config['db']):
            res = self._db.select_one(DatasetBrowser.DS_SEL, params=(self.ds_id,))
            bucket = res[0].split('/')[-2]

        return bucket

    def _get_coordinates(self):
        key = f'{self._uuid}/coordinates.bin'
        s3_object = self._s3_client.get_object(Bucket=self._bucket, Key=key)
        return np.frombuffer(s3_object['Body'].read(), dtype='i').reshape(-1, 2)

    def _get_mz_index(self):
        key = f'{self._uuid}/mz_index.bin'
        s3_object = self._s3_client.get_object(Bucket=self._bucket, Key=key)
        return np.frombuffer(s3_object['Body'].read(), dtype='f')

    def _get_mz_peaks(self):
        mz_low_chunk_idx, mz_high_chunk_idx = np.searchsorted(
            self._mz_index, [self.mz_low, self.mz_high]
        )
        if mz_high_chunk_idx == 0:
            return np.zeros((0, 3), dtype='f')

        # previous chunk actually includes value
        mz_low_chunk_idx -= 1

        chunk_size = 4 * 1024
        offset = mz_low_chunk_idx * chunk_size
        bytes_to_read = (mz_high_chunk_idx - mz_low_chunk_idx + 1) * chunk_size

        key = f'{self._uuid}/peaks_sorted_by_mz.bin'
        bytes = self._s3_client.get_object(
            Bucket=self._bucket, Key=key, Range=f'bytes={offset}-{offset+bytes_to_read}'
        )['Body'].read()
        mz_chunks_array = np.frombuffer(bytes, dtype='f').reshape(-1, 3)

        index_low, index_high = np.searchsorted(mz_chunks_array[:, 0], [self.mz_low, self.mz_high])
        # index_high equals to index after last (?)
        mz_peaks = mz_chunks_array[index_low:index_high]

        return mz_peaks


@app.post('/v1/imzml_browser/search')
def get_intensity_by_mz_ppm():
    try:
        logger.info("IMZML BROWSER")
        params = body_to_json(bottle.request)
        assert params.get('ds_id')
        assert params.get('mz_low')
        assert params.get('mz_high')

        return {'a': 1}
    except Exception as e:
        logger.warning(e)
        return make_response(INTERNAL_ERROR)


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
