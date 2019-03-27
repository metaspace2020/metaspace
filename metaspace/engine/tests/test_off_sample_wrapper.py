from PIL import Image
from mock import patch

from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.off_sample_wrapper import classify_dataset_ion_images
from sm.engine.tests.util import sm_config, test_db, fill_db, metadata, ds_config, pyspark_context


@patch('sm.engine.off_sample_wrapper.ImageStoreServiceWrapper')
@patch('sm.engine.off_sample_wrapper.call_api')
def test_classify_ion_images_preds_saved(call_api_mock, ImageStoreServiceWrapperMock, fill_db):
    call_api_mock.return_value = {
        'predictions': [
            {'prob': 0.1, 'label': 'on'},
            {'prob': 0.9, 'label': 'off'}
        ]
    }
    image_store_mock = ImageStoreServiceWrapperMock()
    image_store_mock.get_image_by_id.return_value = Image.new('RGBA', (10, 10))

    db = DB(sm_config['db'])
    ds_id = '2000-01-01'
    ds = Dataset.load(db, ds_id)

    classify_dataset_ion_images(db, ds)

    annotations = db.select_with_fields(
        ('select off_sample '
         'from dataset d '
         'join job j on j.ds_id = d.id '
         'join iso_image_metrics m on m.job_id = j.id '
         'where d.id = %s '
         'order by m.id '),
        params=(ds_id,)
    )
    exp_annotations = [
        {'off_sample': {'prob': 0.1, 'label': 'on'}},
        {'off_sample': {'prob': 0.9, 'label': 'off'}}
    ]
    assert annotations == exp_annotations
