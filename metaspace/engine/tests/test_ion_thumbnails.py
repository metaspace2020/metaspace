from unittest.mock import patch

import numpy as np
import pytest

from sm.engine.postprocessing.ion_thumbnail import generate_ion_thumbnail, ALGORITHMS
from sm.engine.db import DB
from .utils import create_test_molecular_db, create_test_ds

OLD_IMG_ID = 'old-ion-thumb-id'
IMG_ID = 'new-ion-thumb-id'
IMG_URL = 'ion-thumb-url'


def _make_fake_ds(db, metadata, ds_config):
    ds = create_test_ds(metadata=metadata, config=ds_config)

    moldb = create_test_molecular_db()
    (job_id,) = db.insert_return(
        "INSERT INTO job (moldb_id, ds_id) VALUES (%s, %s) RETURNING id", rows=[(moldb.id, ds.id)]
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

    return ds


def _mock_get_ion_images_for_analysis(ds_id, img_ids, **kwargs):
    images = np.unpackbits(np.arange(len(img_ids), dtype=np.uint8)).reshape((len(img_ids), 8))
    mask = np.ones((4, 2))
    return images, mask, (4, 2)


@pytest.mark.parametrize('algorithm', [alg for alg in ALGORITHMS.keys()])
def test_creates_ion_thumbnail(test_db, algorithm, metadata, ds_config):
    db = DB()
    ds = _make_fake_ds(db, metadata, ds_config)

    with patch('sm.engine.postprocessing.ion_thumbnail.image_storage') as image_storage_mock:
        image_storage_mock.post_image.return_value = IMG_ID
        image_storage_mock.get_image_url.return_value = IMG_URL
        image_storage_mock.get_ion_images_for_analysis.side_effect = (
            _mock_get_ion_images_for_analysis
        )

        generate_ion_thumbnail(db, ds, algorithm=algorithm)

        ion_thumbnail, ion_thumbnail_url = db.select_one(
            "SELECT ion_thumbnail, ion_thumbnail_url FROM dataset WHERE id = %s", [ds.id]
        )
        assert ion_thumbnail == IMG_ID
        assert ion_thumbnail_url == IMG_URL
        assert image_storage_mock.post_image.called
