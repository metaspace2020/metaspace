import numpy as np

from sm.engine.config import SMConfig
from sm.engine.db import DB, ConnectionPool
from sm.engine.storage import get_s3_client
from sm.engine.annotation_lithops.io import deserialize


class DatasetFiles:
    """Class for accessing to imzml browser files and reading them"""

    DS_SEL = 'SELECT input_path FROM dataset WHERE id = %s'

    def __init__(self, ds_id):
        self.ds_id = ds_id

        self._db = DB()
        self._sm_config = SMConfig.get_conf()
        self.s3_client = get_s3_client(sm_config=self._sm_config)

        self.browser_bucket = self._sm_config['imzml_browser_storage']['bucket']
        self.upload_bucket, self.uuid = self._get_bucket_and_uuid()

        self._find_imzml_ibd_name()
        self.ds_coordinates_key = f'{self.uuid}/coordinates.npy'
        self.mz_index_key = f'{self.uuid}/mz_index.npy'
        self.mz_sorted_peaks_key = f'{self.uuid}/peaks_sorted_by_mz.npy'
        self.portable_spectrum_reader = f'{self.uuid}/portable_spectrum_reader.pickle'

    def _get_bucket_and_uuid(self):
        with ConnectionPool(self._sm_config['db']):
            # add exception for non existed ds_id
            res = self._db.select_one(DatasetFiles.DS_SEL, params=(self.ds_id,))
            uuid = res[0].split('/')[-1]
            bucket = res[0].split('/')[-2]

        return bucket, uuid

    def _find_imzml_ibd_name(self):
        for obj in self.s3_client.list_objects(Bucket=self.upload_bucket, Prefix=self.uuid)[
            'Contents'
        ]:
            key = obj['Key'].lower()
            if key.endswith('.imzml'):
                self.imzml_key = key
            elif key.endswith('.ibd'):
                self.ibd_key = key

    # def read_imzml_file(self):
    #     s3_object = self.s3_client.get_object(Bucket=self.browser_bucket, Key=self.imzml_key)
    #     return s3_object['Body'].read()

    def read_coordinates(self) -> bytes:
        s3_object = self.s3_client.get_object(
            Bucket=self.browser_bucket, Key=self.ds_coordinates_key
        )
        return s3_object['Body'].read()

    def read_mz_index(self) -> bytes:
        s3_object = self.s3_client.get_object(Bucket=self.browser_bucket, Key=self.mz_index_key)
        return s3_object['Body'].read()

    def read_mz_peaks(self, offset, bytes_to_read):
        s3_object = self.s3_client.get_object(
            Bucket=self.browser_bucket,
            Key=self.mz_sorted_peaks_key,
            Range=f'bytes={offset}-{offset + bytes_to_read - 1}',
        )
        return s3_object['Body'].read()

    def read_portable_spectrum_reader(self):
        print(f'{self.portable_spectrum_reader}')
        s3_object = self.s3_client.get_object(
            Bucket=self.browser_bucket, Key=self.portable_spectrum_reader
        )
        return s3_object['Body'].read()


class DatasetBrowser:
    def __init__(self, ds_id, mz_low, mz_high):
        self.ds_id = ds_id
        self.mz_low = mz_low
        self.mz_high = mz_high

        self.ds_files = DatasetFiles(ds_id)

        # self.coordinates = deserialize(self.ds_files.read_coordinates()).reshape(-1, 2)
        self.coordinates = np.frombuffer(self.ds_files.read_coordinates(), dtype='i').reshape(-1, 2)
        # self.mz_index = deserialize(self.ds_files.read_mz_index())
        self.mz_index = np.frombuffer(self.ds_files.read_mz_index(), dtype='f')
        self.mz_peaks = self.get_mz_peaks()
        self.portable_reader = deserialize(self.ds_files.read_portable_spectrum_reader())

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
        print(offset, bytes_to_read)
        mz_chunks_array = np.frombuffer(
            self.ds_files.read_mz_peaks(offset, bytes_to_read), dtype='f'
        ).reshape(-1, 3)

        index_low, index_high = np.searchsorted(mz_chunks_array[:, 0], [self.mz_low, self.mz_high])
        # index_high equals to index after last valid element
        mz_peaks = mz_chunks_array[index_low:index_high]

        return mz_peaks
