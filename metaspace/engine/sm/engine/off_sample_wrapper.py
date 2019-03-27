import base64
import json
import logging
from functools import partial, wraps
from io import BytesIO
import random
from time import sleep

from requests import post, get

from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import SMConfig

sm_config = SMConfig.get_conf()
api_endpoint = sm_config['services']['off_sample']

logger = logging.getLogger('update-daemon')


def make_chunk_gen(a, chunk_size):
    chunk_n = (len(a) - 1) // chunk_size + 1
    chunks = [a[i * chunk_size:(i + 1) * chunk_size] for i in range(chunk_n)]
    for image_path_chunk in chunks:
        yield image_path_chunk


def encode_image_as_base64(img):
    fp = BytesIO()
    img.save(fp, format='PNG')
    fp.seek(0)
    return base64.b64encode(fp.read()).decode()


def base64_images_to_doc(images):
    images_doc = {
        'images': [{'content': content} for content in images]
    }
    return images_doc


def retry_on_error(num_retries=1):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(num_retries):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    delay = random.uniform(2, 2**(i + 2))
                    logger.warning(f'Off-sample API error on attempt {i + 1}. '
                                   f'Retrying after {delay:.1f} seconds...')
                    sleep(delay)
            # Last attempt, don't catch the exception
            return func(*args, **kwargs)

        return wrapper

    return decorator


@retry_on_error()
def call_api(uri='', doc=None):
    if doc:
        resp = post(url=api_endpoint + uri, json=doc)
    else:
        resp = get(url=api_endpoint + uri)
    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(resp.content or resp)


SEL_ION_IMAGES = (
    'select m.id as ann_id, iso_image_ids[1] as img_id '
    'from dataset d '
    'join job j on j.ds_id = d.id '
    'join iso_image_metrics m on m.job_id = j.id '
    'where d.id = %s'
    'order by m.id '
)
UPD_OFF_SAMPLE = (
    'update iso_image_metrics as row set off_sample = row2.off_sample::json '
    'from (values %s) as row2(id, off_sample) '
    'where row.id = row2.id; '
)


def classify_images(it, get_image):
    image_predictions = []
    try:
        for chunk in make_chunk_gen(it, chunk_size=32):
            logger.info('Off-sample classification of {} images'.format(len(chunk)))

            base64_images = []
            for elem in chunk:
                img = get_image(elem)
                base64_images.append(encode_image_as_base64(img))

            images_doc = base64_images_to_doc(base64_images)
            pred_doc = call_api('/predict', doc=images_doc)
            image_predictions.extend(pred_doc['predictions'])
    except Exception as e:
        logger.warning(f'Failed to classify images: {e}')
    return image_predictions


def classify_dataset_ion_images(db, ds):
    image_store_service = ImageStoreServiceWrapper(sm_config['services']['img_service_url'])
    storage_type = ds.get_ion_img_storage_type(db)
    get_image_by_id = partial(image_store_service.get_image_by_id, storage_type, 'iso_image')

    annotations = db.select_with_fields(SEL_ION_IMAGES, (ds.id,))
    image_ids = [a['img_id'] for a in annotations]
    image_predictions = classify_images(image_ids, get_image_by_id)

    rows = [(ann['ann_id'], json.dumps(pred))
            for ann, pred in zip(annotations, image_predictions)]
    db.alter_many(UPD_OFF_SAMPLE, rows)
