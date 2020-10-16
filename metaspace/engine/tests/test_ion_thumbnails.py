from datetime import datetime
from unittest.mock import MagicMock

import numpy as np
import pytest

from sm.engine.ion_thumbnail import generate_ion_thumbnail, ALGORITHMS
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.image_store import ImageStoreServiceWrapper
from .utils import create_test_molecular_db

OLD_IMG_ID = 'old-ion-thumb-id'
IMG_ID = 'new-ion-thumb-id'
DS_ID = '2000-01-01_00h00m'


def _make_fake_ds(db, ds_id, metadata, ds_config):
    ds = Dataset(
        id=ds_id,
        name='name',
        input_path='path',
        upload_dt=datetime.now(),
        metadata=metadata,
        config=ds_config,
        status=DatasetStatus.FINISHED,
    )
    ds.save(db)

    moldb = create_test_molecular_db()
    (job_id,) = db.insert_return(
        "INSERT INTO job (moldb_id, ds_id) VALUES (%s, %s) RETURNING id", rows=[(moldb.id, ds_id)]
    )
    db.insert(
        (
            "INSERT INTO annotation ("
            "   job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, stats, iso_image_ids"
            ") "
            "VALUES (%s, %s, '', '', %s, 1, 0, '{}', %s)"
        ),
        rows=[(job_id, f'H{i+1}O', '+H', [str(i), str(1000 + i)]) for i in range(200)],
    )


def _mock_get_ion_images_for_analysis(storage_type, img_ids, **kwargs):
    images = np.unpackbits(np.arange(len(img_ids), dtype=np.uint8)).reshape((len(img_ids), 8))
    mask = np.ones((4, 2))
    return images, mask, (4, 2)


@pytest.mark.parametrize('algorithm', [alg for alg in ALGORITHMS.keys()])
def test_creates_ion_thumbnail(test_db, algorithm, metadata, ds_config):
    db = DB()
    img_store_mock = MagicMock(spec=ImageStoreServiceWrapper)
    img_store_mock.post_image.return_value = IMG_ID
    img_store_mock.get_ion_images_for_analysis.side_effect = _mock_get_ion_images_for_analysis
    _make_fake_ds(db, DS_ID, metadata, ds_config)

    generate_ion_thumbnail(db, img_store_mock, DS_ID, algorithm=algorithm)

    (new_ion_thumbnail,) = db.select_one("SELECT ion_thumbnail FROM dataset WHERE id = %s", [DS_ID])
    assert new_ion_thumbnail == IMG_ID
    assert img_store_mock.post_image.called
