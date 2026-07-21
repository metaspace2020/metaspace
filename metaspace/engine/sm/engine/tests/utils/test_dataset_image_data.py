"""Unit tests for the shared dataset image-data accessors."""

from io import BytesIO
from unittest.mock import MagicMock

import numpy as np

from sm.engine.utils import dataset_image_data


DS_ID = '2020-01-01_00h00m00s'


def test_get_ppm_returns_int_from_dataset_config():
    db = MagicMock()
    db.select_one.return_value = ('3',)

    ppm = dataset_image_data.get_ppm(db, DS_ID)

    assert ppm == 3
    assert isinstance(ppm, int)
    db.select_one.assert_called_once()
    assert db.select_one.call_args.kwargs['params'] == (DS_ID,)


def test_get_imzml_browser_dataset_stacks_mzs_ints_sp_idxs():
    db = MagicMock()
    db.select_one.return_value = ('s3://bucket/path/the-uuid',)

    mzs = np.array([100.0, 200.0], dtype='f')
    ints = np.array([10.0, 20.0], dtype='f')
    sp_idxs = np.array([0.0, 1.0], dtype='f')
    payload = {
        'the-uuid/mzs.npy': mzs.tobytes(),
        'the-uuid/ints.npy': ints.tobytes(),
        'the-uuid/sp_idxs.npy': sp_idxs.tobytes(),
    }

    s3_client = MagicMock()
    s3_client.get_object.side_effect = lambda Bucket, Key: {'Body': BytesIO(payload[Key])}
    sm_config = {'imzml_browser_storage': {'bucket': 'browser-bucket'}}

    peak_array = dataset_image_data.get_imzml_browser_dataset(db, s3_client, sm_config, DS_ID)

    # Shape is (n_peaks, 3) — columns are mzs, ints, sp_idxs
    assert peak_array.shape == (2, 3)
    np.testing.assert_array_equal(peak_array[:, 0], mzs)
    np.testing.assert_array_equal(peak_array[:, 1], ints)
    np.testing.assert_array_equal(peak_array[:, 2], sp_idxs)
    # uuid is the last path segment of input_path; bucket comes from sm_config
    assert s3_client.get_object.call_args.kwargs['Bucket'] == 'browser-bucket'


def test_get_tic_image_loads_npy_from_image_storage():
    db = MagicMock()
    db.select.return_value = [[[{'image_id': 'tic-img-id'}]]]

    tic = np.arange(6, dtype=np.float32).reshape(2, 3)
    buf = BytesIO()
    np.save(buf, tic, allow_pickle=False)

    image_storage = MagicMock()
    image_storage.DIAG = 'diag'
    image_storage.get_image.return_value = buf.getvalue()

    result = dataset_image_data.get_tic_image(db, image_storage, DS_ID)

    np.testing.assert_array_equal(result, tic)
    image_storage.get_image.assert_called_once_with('diag', DS_ID, 'tic-img-id')
