import io
from collections import defaultdict

from PIL import Image
from unittest.mock import patch

from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.postprocessing.off_sample_wrapper import classify_dataset_ion_images


@patch('sm.engine.postprocessing.off_sample_wrapper.image_storage')
@patch('sm.engine.postprocessing.off_sample_wrapper.call_api')
def test_classify_ion_images_preds_saved(call_api_mock, image_storage_mock, fill_db):
    call_api_mock.return_value = {
        'predictions': [{'prob': 0.1, 'label': 'on'}, {'prob': 0.9, 'label': 'off'}]
    }

    fp = io.BytesIO()
    Image.new('RGBA', (10, 10)).save(fp, format='PNG')
    fp.seek(0)
    img_bytes = fp.read()
    image_storage_mock.get_image.return_value = img_bytes

    db = DB()
    ds_id = '2000-01-01'
    ds = Dataset.load(db, ds_id)

    services_config = defaultdict(str)
    classify_dataset_ion_images(db, ds, services_config)

    annotations = db.select_with_fields(
        (
            'select off_sample '
            'from dataset d '
            'join job j on j.ds_id = d.id '
            'join annotation m on m.job_id = j.id '
            'where d.id = %s '
            'order by m.id '
        ),
        params=(ds_id,),
    )
    exp_annotations = [
        {'off_sample': {'prob': 0.1, 'label': 'on'}},
        {'off_sample': {'prob': 0.9, 'label': 'off'}},
    ]
    assert annotations == exp_annotations
