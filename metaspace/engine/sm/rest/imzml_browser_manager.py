import numpy as np

from sm.engine.config import SMConfig
from sm.engine.db import DB
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
        self._get_bucket_and_uuid()

        self.mz_index_key = f'{self.uuid}/mz_index.npy'
        self.mzs_key = f'{self.uuid}/mzs.npy'
        self.ints_key = f'{self.uuid}/ints.npy'
        self.sp_idxs_key = f'{self.uuid}/sp_idxs.npy'
        self.portable_spectrum_reader_key = f'{self.uuid}/portable_spectrum_reader.pickle'

        self.find_ibd_key()
        self.check_imzml_browser_files()

    def _get_bucket_and_uuid(self) -> None:
        res = self._db.select_one(DatasetFiles.DS_SEL, params=(self.ds_id,))
        try:
            self.uuid = res[0].split('/')[-1]
            self.upload_bucket = res[0].split('/')[-2]
        except IndexError:
            raise ValueError(f'Dataset {self.ds_id} does not exist')  # pylint: disable=W0707

    def find_ibd_key(self) -> None:
        for obj in self.s3_client.list_objects(Bucket=self.upload_bucket, Prefix=self.uuid)[
            'Contents'
        ]:
            if obj['Key'].lower().endswith('.ibd'):
                self.ibd_key = obj['Key']

    def check_imzml_browser_files(self):
        """Checking for the presence of all 5 files required for imzml browser"""
        status = False
        response = self.s3_client.list_objects(Bucket=self.browser_bucket, Prefix=self.uuid)
        if response.get('Contents'):
            objects = {item['Key'] for item in response['Contents']}
            files = {
                self.mz_index_key,
                self.mzs_key,
                self.ints_key,
                self.sp_idxs_key,
                self.portable_spectrum_reader_key,
            }
            if len(objects) == 5 and (objects - files) == set():
                status = True

        return status

    def read_file(self, key: str, bucket: str = '') -> bytes:
        if not bucket:
            bucket = self.browser_bucket
        s3_object = self.s3_client.get_object(Bucket=bucket, Key=key)
        return s3_object['Body'].read()

    def read_file_partially(
        self, offset: int, bytes_to_read: int, key: str, bucket: str = ''
    ) -> bytes:
        if not bucket:
            bucket = self.browser_bucket
        s3_object = self.s3_client.get_object(
            Bucket=bucket,
            Key=key,
            Range=f'bytes={offset}-{offset + bytes_to_read - 1}',
        )
        return s3_object['Body'].read()


class DatasetBrowser:
    def __init__(self, ds_id, mz_low, mz_high):
        self.ds_id = ds_id
        self.mz_low = mz_low
        self.mz_high = mz_high

        self.ds = DatasetFiles(ds_id)
        self.mz_index = np.frombuffer(self.ds.read_file(self.ds.mz_index_key), dtype='f')
        self.portable_reader = deserialize(self.ds.read_file(self.ds.portable_spectrum_reader_key))
        self.coordinates = np.array(self.portable_reader.coordinates, dtype='i')[:, :2]
        self.mz_peaks = self.get_mz_peaks()

    def get_mz_peaks(self):
        """Return an array of records mz, int, sp_idx located between mz_low and mz_high

        Based on the mz_low and mz_high values, we calculate the index of chunks
        and offsets in bytes to read from the files of these chunks.
        The resulting combined arrays are filtered by mz_low/mz_high and returned.
        """

        # calculate the index of the lower and upper chunk
        mz_low_chunk_idx, mz_high_chunk_idx = np.searchsorted(
            self.mz_index, [self.mz_low, self.mz_high]
        )
        if mz_high_chunk_idx == 0:
            return np.zeros((0, 3), dtype='f')
        # previous chunk actually includes value
        if mz_low_chunk_idx > 0:
            mz_low_chunk_idx -= 1

        chunk_size = 4 * 1024  # element in bytes, chunk record size
        offset = mz_low_chunk_idx * chunk_size
        bytes_to_read = (mz_high_chunk_idx - mz_low_chunk_idx + 1) * chunk_size

        mz_chunks_array = np.frombuffer(
            self.ds.read_file_partially(offset, bytes_to_read, self.ds.mzs_key),
            dtype='f',
        )
        int_chucks_array = np.frombuffer(
            self.ds.read_file_partially(offset, bytes_to_read, self.ds.ints_key),
            dtype='f',
        )
        sp_idxs_chunk_array = np.frombuffer(
            self.ds.read_file_partially(offset, bytes_to_read, self.ds.sp_idxs_key),
            dtype='f',
        )

        peaks_chunk_array = np.stack([mz_chunks_array, int_chucks_array, sp_idxs_chunk_array]).T
        index_low, index_high = np.searchsorted(
            peaks_chunk_array[:, 0], [self.mz_low, self.mz_high]
        )
        # index_high equals to index after last valid element
        mz_peaks = peaks_chunk_array[index_low:index_high]

        return mz_peaks
