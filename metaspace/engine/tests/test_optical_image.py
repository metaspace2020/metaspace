import io
import itertools
from unittest.mock import patch

import PIL.Image

from sm.engine.db import DB
from sm.engine.optical_image import add_optical_image, OpticalImageType
from tests.utils import create_test_ds


def test_add_optical_image(fill_db, metadata, ds_config):
    with patch('sm.engine.optical_image.image_storage') as image_storage_mock:
        image_storage_mock.post_image.side_effect = [
            'opt_img_scaled_id1',
            'opt_img_id1',
            'opt_img_scaled_id2',
            'opt_img_id2',
            'opt_img_scaled_id3',
            'opt_img_id3',
            'thumbnail_id',
        ]
        fp = io.BytesIO()
        PIL.Image.new('RGB', (100, 100)).save(fp, format='PNG')
        fp.seek(0)
        image_storage_mock.get_image.return_value = fp.read()

        db = DB()
        ds = create_test_ds()

        zoom_levels = [1, 2, 3]
        raw_img_id = 'raw_opt_img_id'
        add_optical_image(
            db, ds.id, raw_img_id, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], zoom_levels=zoom_levels
        )
        optical_images = db.select(f"SELECT ds_id, type, zoom FROM optical_image")
        for type, zoom in itertools.product(
            [OpticalImageType.SCALED, OpticalImageType.CLIPPED_TO_ION_IMAGE], zoom_levels
        ):
            assert (ds.id, type, zoom) in optical_images

        assert db.select('SELECT optical_image FROM dataset where id = %s', params=(ds.id,)) == [
            (raw_img_id,)
        ]
        assert db.select('SELECT thumbnail FROM dataset where id = %s', params=(ds.id,)) == [
            ('thumbnail_id',)
        ]
