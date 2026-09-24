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
