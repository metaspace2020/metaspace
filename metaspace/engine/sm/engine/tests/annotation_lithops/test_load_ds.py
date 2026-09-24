"""Unit tests for the imzML browser file upload in load_ds."""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from sm.engine.annotation_lithops import load_ds
from sm.engine.annotation_lithops.io import multipart_upload_cobj
from sm.engine.annotation_lithops.load_ds import (
    BROWSER_FILES,
    BROWSER_UPLOAD_THREADS,
    _upload_imzml_browser_files,
)


UUID = 'the-uuid'


def _args():
    mzs = np.array([100.0, 200.0, 300.0], dtype='d')
    ints = np.array([10.0, 20.0, 30.0], dtype='f')
    sp_idxs = np.array([0, 1, 1], dtype=np.uint32)
    imzml_reader = MagicMock()
    return mzs, ints, sp_idxs, imzml_reader


def _storage(keys):
    storage = MagicMock()
    storage.bucket = 'browser-bucket'
    storage.list_keys.return_value = list(keys)
    return storage


def _uploaded_keys(storage, save_cobj):
    """Every key written by the block. The pickle goes through save_cobj, the rest direct."""
    written = {call.kwargs['key'] for call in storage.put_cloudobject.call_args_list}
    return written | {call.kwargs['key'] for call in save_cobj.call_args_list}


def test_browser_files_matches_what_the_rest_api_expects():
    """DatasetFiles.check_imzml_browser_files requires exactly these 5 keys per uuid.

    Pinning the list also keeps it non-empty, which the skip check relies on: `all()` over
    an empty iterable is True, so an emptied constant would silently skip every upload.
    """
    assert set(BROWSER_FILES) == {
        'mzs.npy',
        'ints.npy',
        'sp_idxs.npy',
        'mz_index.npy',
        'portable_spectrum_reader.pickle',
    }


@patch('sm.engine.annotation_lithops.load_ds.save_cobj')
def test_skips_upload_when_complete_set_already_exists(save_cobj):
    storage = _storage(f'{UUID}/{name}' for name in BROWSER_FILES)

    skipped = _upload_imzml_browser_files(*_args(), storage, UUID)

    assert skipped is True
    storage.list_keys.assert_called_once_with('browser-bucket', f'{UUID}/')
    assert _uploaded_keys(storage, save_cobj) == set()


@patch('sm.engine.annotation_lithops.load_ds.save_cobj')
def test_uploads_every_file_when_bucket_is_empty(save_cobj):
    storage = _storage([])

    skipped = _upload_imzml_browser_files(*_args(), storage, UUID)

    assert skipped is False
    assert _uploaded_keys(storage, save_cobj) == {f'{UUID}/{name}' for name in BROWSER_FILES}


@patch('sm.engine.annotation_lithops.load_ds.save_cobj')
def test_uploads_when_the_set_is_incomplete(save_cobj):
    """An interrupted run leaves some keys behind - they must not pass as a complete set."""
    for missing in BROWSER_FILES:
        save_cobj.reset_mock()
        storage = _storage(f'{UUID}/{name}' for name in BROWSER_FILES if name != missing)

        skipped = _upload_imzml_browser_files(*_args(), storage, UUID)

        assert skipped is False, f'a set missing {missing} was treated as complete'
        assert _uploaded_keys(storage, save_cobj) == {f'{UUID}/{name}' for name in BROWSER_FILES}


@patch('sm.engine.annotation_lithops.load_ds.save_cobj')
def test_ignores_keys_belonging_to_another_dataset(save_cobj):
    storage = _storage(f'other-uuid/{name}' for name in BROWSER_FILES)

    skipped = _upload_imzml_browser_files(*_args(), storage, UUID)

    assert skipped is False
    assert _uploaded_keys(storage, save_cobj) == {f'{UUID}/{name}' for name in BROWSER_FILES}


class FakeS3:
    """Records what a multipart upload actually sent, and reassembles it by PartNumber.

    Takes **kwargs because boto3's parameters are PascalCase and keyword-only.
    """

    def __init__(self):
        self.started = []
        self.parts = {}
        self.completed = {}
        self.aborted = []

    def create_multipart_upload(self, **kwargs):
        self.started.append(kwargs['Key'])
        return {'UploadId': f'upload-{kwargs["Key"]}'}

    def upload_part(self, **kwargs):
        number, body = kwargs['PartNumber'], kwargs['Body']
        assert isinstance(body, bytes), f'part {number} sent {type(body)}'
        self.parts.setdefault(kwargs['Key'], {})[number] = body
        return {'ETag': f'etag-{number}'}

    def complete_multipart_upload(self, **kwargs):
        numbers = [part['PartNumber'] for part in kwargs['MultipartUpload']['Parts']]
        assert numbers == sorted(numbers), f'parts out of order: {numbers}'
        self.completed[kwargs['Key']] = b''.join(self.parts[kwargs['Key']][n] for n in numbers)

    def abort_multipart_upload(self, **kwargs):
        self.aborted.append(kwargs['Key'])


def _multipart_storage():
    storage = MagicMock()
    storage.bucket = 'bucket'
    storage.backend = 'aws_s3'
    storage.get_client.return_value = FakeS3()
    return storage


KB_MB = 1 / 1024


def test_multipart_streams_an_array_without_a_full_copy():
    """Every part is sliced and cast on its own - a full float32 copy never exists."""
    storage = _multipart_storage()
    mzs = np.linspace(100, 1000, 5000, dtype='d')

    multipart_upload_cobj(storage, mzs, key='mzs.npy', dtype='f', part_size_mb=4 * KB_MB)

    s3 = storage.get_client.return_value
    assert len(s3.parts['mzs.npy']) > 1, 'payload was sent as a single part'
    assert s3.completed['mzs.npy'] == mzs.astype('f').tobytes()


def test_multipart_converts_sp_idxs_to_float32_per_part():
    storage = _multipart_storage()
    data = np.arange(5000, dtype=np.uint32)

    multipart_upload_cobj(storage, data, key='sp.npy', dtype='f', part_size_mb=4 * KB_MB)

    assert storage.get_client.return_value.completed['sp.npy'] == data.astype('f').tobytes()


def test_multipart_uploads_a_bytes_view_unchanged():
    """save_cobj feeds it serialized DataFrames as a zero-copy uint8 view of the bytes;
    the reassembled object must stay byte-identical."""
    storage = _multipart_storage()
    payload = bytes(range(256)) * 400
    data = np.frombuffer(payload, np.uint8)

    multipart_upload_cobj(storage, data, key='blob', part_size_mb=16 * KB_MB)

    s3 = storage.get_client.return_value
    assert len(s3.parts['blob']) > 1
    assert s3.completed['blob'] == payload


def test_multipart_aborts_when_a_part_fails():
    storage = _multipart_storage()
    s3 = storage.get_client.return_value
    s3.upload_part = MagicMock(side_effect=ValueError('boom'))

    with pytest.raises(ValueError):
        multipart_upload_cobj(storage, np.zeros(5000, 'd'), key='k', part_size_mb=4 * KB_MB)

    assert s3.aborted == ['k'], 'a failed upload must not leave the MPU dangling'


def test_browser_files_keep_their_old_bytes():
    """Byte-for-byte identical to what the single-PUT path produced, which the imzML
    browser reads back with ranged GETs at fixed float32 offsets."""
    n_peaks = 3 * 1024
    mzs = np.linspace(100, 1000, n_peaks, dtype='d')
    ints = np.linspace(1, 9, n_peaks, dtype='f')
    sp_idxs = np.arange(n_peaks, dtype=np.uint32)
    storage = _storage([])
    s3 = FakeS3()
    storage.get_client.return_value = s3

    with patch.object(load_ds, 'MULTIPART_THRESHOLD_MB', 0), patch.object(load_ds, 'save_cobj'):
        skipped = _upload_imzml_browser_files(mzs, ints, sp_idxs, MagicMock(), storage, UUID)

    assert skipped is False
    assert s3.completed[f'{UUID}/mzs.npy'] == mzs.astype('f').tobytes()
    assert s3.completed[f'{UUID}/ints.npy'] == ints.astype('f').tobytes()
    assert s3.completed[f'{UUID}/sp_idxs.npy'] == sp_idxs.astype('f').tobytes()
    # mz_index stays a single PUT, and is built off the float64 source
    (index_call,) = storage.put_cloudobject.call_args_list
    assert index_call.kwargs['key'] == f'{UUID}/mz_index.npy'
    assert index_call.args[0] == mzs.astype('f')[::1024].tobytes()


def test_upload_concurrency_stays_at_the_measured_optimum():
    """Pinned on purpose, so raising it means reading this first.

    Aggregate S3 throughput peaks at 4 concurrent uploads - 294 MB/s on r6a.large,
    351 on r6a.2xlarge - and falls off beyond it. 12 was shipped once and measured 39%
    slower on this very block. Re-measure with bench_s3_upload.py before changing this.
    """
    assert BROWSER_UPLOAD_THREADS == 4


def test_browser_files_share_a_single_pool(monkeypatch):
    """Three files with a pool each would put 3x the parts in flight, past the optimum."""
    pool_sizes = []
    real_pool = ThreadPoolExecutor
    monkeypatch.setattr(
        load_ds,
        'ThreadPoolExecutor',
        lambda max_workers: pool_sizes.append(max_workers) or real_pool(max_workers),
    )
    storage = _storage([])
    storage.get_client.return_value = FakeS3()

    with patch.object(load_ds, 'MULTIPART_THRESHOLD_MB', 0), patch.object(load_ds, 'save_cobj'):
        _upload_imzml_browser_files(*_args(), storage, UUID)

    assert pool_sizes == [BROWSER_UPLOAD_THREADS], f'expected one pool of {BROWSER_UPLOAD_THREADS}'
