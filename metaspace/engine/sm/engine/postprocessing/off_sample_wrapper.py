import base64
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from PIL import Image
from requests import post, get
import numpy as np

from sm.engine.errors import SMError
from sm.engine import image_storage
from sm.engine.utils.retry_on_exception import retry_on_exception

logger = logging.getLogger('update-daemon')


def make_chunk_gen(items, chunk_size):
    chunk_n = (len(items) - 1) // chunk_size + 1
    chunks = [items[i * chunk_size : (i + 1) * chunk_size] for i in range(chunk_n)]
    for image_path_chunk in chunks:
        yield image_path_chunk


def base64_images_to_doc(images):
    images_doc = {'images': [{'content': content} for content in images]}
    return images_doc


SEL_ION_IMAGES = (
    'select m.id as ann_id, iso_image_ids[1] as img_id '
    'from dataset d '
    'join job j on j.ds_id = d.id '
    'join annotation m on m.job_id = j.id '
    'where d.id = %s and (%s or m.off_sample is null) and iso_image_ids[1] is not NULL '
    'order by m.id '
)
UPD_OFF_SAMPLE = (
    'update annotation as row set off_sample = row2.off_sample::json '
    'from (values %s) as row2(id, off_sample) '
    'where row.id = row2.id; '
)


def numpy_to_pil(a):
    assert a.ndim > 1

    if a.ndim == 2:
        a_min, a_max = a.min(), a.max()
    else:
        a = a[:, :, :3]
        a_min, a_max = a.min(axis=(0, 1)), a.max(axis=(0, 1))

    a = ((a - a_min) / (a_max - a_min) * 255).astype(np.uint8)
    return Image.fromarray(a)


@retry_on_exception(SMError, num_retries=6, retry_wait_params=(10, 10, 5))
def call_api(url='', doc=None):
    if doc:
        resp = post(url=url, json=doc, timeout=120)
    else:
        resp = get(url=url)
    if resp.status_code == 200:
        return resp.json()
    raise SMError(resp.content or resp)


def make_classify_images(api_endpoint, ds_id):
    def classify(chunk):
        logger.debug(f'Classifying chunk of {len(chunk)} images')

        base64_images = []
        for img_id in chunk:
            img_bytes = image_storage.get_image(image_storage.ISO, ds_id, img_id)
            img_base64 = base64.b64encode(img_bytes).decode()
            base64_images.append(img_base64)

        images_doc = base64_images_to_doc(base64_images)
        pred_doc = call_api(api_endpoint + '/predict', doc=images_doc)
        return pred_doc['predictions']

    def classify_items(items):
        logger.info(f'Off-sample classification of {len(items)} images')
        with ThreadPoolExecutor(8) as pool:
            chunk_it = make_chunk_gen(items, chunk_size=32)
            preds_list = pool.map(classify, chunk_it)
        image_predictions = [p for preds in preds_list for p in preds]
        return image_predictions

    return classify_items


def classify_dataset_ion_images(db, ds, services_config, overwrite_existing=False):
    """Classifies all dataset ion images.

    Args:
        db (sm.engine.db.DB): database connection
        ds (sm.engine.dataset.Dataset): target dataset
        services_config (dict): configuration for services
        overwrite_existing (bool): whether to overwrite existing image classes
    """
    off_sample_api_endpoint = services_config['off_sample']

    annotations = db.select_with_fields(SEL_ION_IMAGES, (ds.id, overwrite_existing))
    image_ids = [a['img_id'] for a in annotations]

    classify_images = make_classify_images(off_sample_api_endpoint, ds.id)
    image_predictions = classify_images(image_ids)

    rows = [(ann['ann_id'], json.dumps(pred)) for ann, pred in zip(annotations, image_predictions)]
    db.alter_many(UPD_OFF_SAMPLE, rows)
