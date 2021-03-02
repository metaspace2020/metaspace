import io
import logging
import uuid
from concurrent.futures.thread import ThreadPoolExecutor
from enum import Enum
from typing import List, Tuple, Dict, Callable

import numpy as np
from scipy.ndimage import zoom
import PIL.Image

from sm.engine.storage import get_s3_resource, create_bucket

logger = logging.getLogger('engine')


class ImageType(str, Enum):
    ISO = 'iso'
    OPTICAL = 'optical'
    THUMB = 'thumb'


class ImageStorage:
    Type = ImageType

    def __init__(self, config: Dict):
        logger.info(f'Initializing image storage from config: {config}')
        s3 = get_s3_resource()
        self.s3_client = s3.meta.client
        create_bucket(config['bucket'])
        self.bucket = s3.Bucket(config['bucket'])

    @staticmethod
    def _make_key(image_type, ds_id, img_id):
        return f'{image_type}/{ds_id}/{img_id}'

    def _get_object(self, image_type, ds_id, img_id):
        key = self._make_key(image_type, ds_id, img_id)
        return self.bucket.Object(key)

    @staticmethod
    def _gen_id() -> str:
        return uuid.uuid4().hex

    def post_image(self, image_type: ImageType, ds_id: str, image_bytes: bytes) -> str:
        img_id = self._gen_id()
        obj = self._get_object(image_type, ds_id, img_id)
        obj.put(Body=image_bytes)
        return img_id

    def get_image(self, image_type: ImageType, ds_id: str, image_id: str) -> bytes:
        obj = self._get_object(image_type, ds_id, image_id)
        return obj.get()['Body'].read()

    def delete_image(self, image_type: ImageType, ds_id: str, image_id: str):
        obj = self._get_object(image_type, ds_id, image_id)
        obj.delete()

    def get_image_url(self, image_type: ImageType, ds_id: str, image_id: str) -> str:
        endpoint = self.s3_client.meta.endpoint_url
        key = self._make_key(image_type, ds_id, image_id)
        return f'{endpoint}/{key}'


_instance: ImageStorage

get_image: Callable[[ImageType, str, str], bytes]
post_image: Callable[[ImageType, str, bytes], str]
delete_image: Callable[[ImageType, str, str], None]
get_image_url: Callable[[ImageType, str, str], str]


def init(config: Dict):
    global _instance, get_image, post_image, delete_image, get_image_url
    _instance = ImageStorage(config)
    get_image = _instance.get_image
    post_image = _instance.post_image
    delete_image = _instance.delete_image
    get_image_url = _instance.get_image_url


def get_ion_images_for_analysis(
    ds_id: str,
    image_ids: List[str],
    hotspot_percentile: int = 99,
    max_size: Tuple[int, int] = None,
    max_mem_mb: int = 2048,
):
    """Retrieves ion images, does hot-spot removal and resizing,
    and returns them as numpy array.

    Args:
        image_ids:
        hotspot_percentile:
        max_size (Union[None, tuple[int, int]]):
            If images are greater than this size, they will be downsampled to fit in this size
        max_mem_mb (Union[None, float]):
            If the output numpy array would require more than this amount of memory,
            images will be downsampled to fit

    Returns:
        tuple[np.ndarray, np.ndarray, tuple[int, int]]
            (value, mask, (h, w))
            value - A float32 numpy array with shape (len(img_ids), h * w)
                where each row is one image
            mask - A float32 numpy array with shape (h, w) containing the ion image mask.
                May contain values that are between 0 and 1 if downsampling
                caused both filled and empty pixels to be merged
            h, w - shape of each image in value such that value[i].reshape(h, w)
                reconstructs the image
    """
    assert all(image_ids)

    zoom_factor = 1
    h, w = None, None
    value, mask = None, None

    def setup_shared_vals(img):
        nonlocal zoom_factor, h, w, value, mask

        img_h, img_w = img.height, img.width
        if max_size:
            size_zoom = min(max_size[0] / img_h, max_size[1] / img_w)
            zoom_factor = min(zoom_factor, size_zoom)
        if max_mem_mb:
            expected_mem = img_h * img_w * len(image_ids) * 4 / 1024 / 1024
            zoom_factor = min(zoom_factor, max_mem_mb / expected_mem)

        raw_mask = np.float32(np.array(img)[:, :, 3] != 0)
        if abs(zoom_factor - 1) < 0.001:
            zoom_factor = 1
            mask = raw_mask
        else:
            mask = zoom(raw_mask, zoom_factor, prefilter=False)

        h, w = mask.shape
        value = np.empty((len(image_ids), h * w), dtype=np.float32)

    def process_img(img_id: str, idx, do_setup=False):
        img_bytes = get_image(ImageType.ISO, ds_id, img_id)
        img = PIL.Image.open(io.BytesIO(img_bytes))
        if do_setup:
            setup_shared_vals(img)

        img_arr = np.asarray(img, dtype=np.float32)[:, :, 0]

        # Try to use the hotspot percentile,
        # but fall back to the image's maximum or 1.0 if needed
        # to ensure that there are no divide-by-zero issues
        hotspot_threshold = np.percentile(img_arr, hotspot_percentile) or np.max(img_arr) or 1.0
        np.clip(img_arr, None, hotspot_threshold, out=img_arr)

        if zoom_factor != 1:
            zoomed_img = zoom(img_arr, zoom_factor)
        else:
            zoomed_img = img_arr

        # Note: due to prefiltering & smoothing, zoom can change the min/max of the image,
        # so hotspot_threshold cannot be reused here for scaling
        np.clip(zoomed_img, 0, None, out=zoomed_img)
        zoomed_img /= np.max(zoomed_img) or 1

        value[idx, :] = zoomed_img.ravel()  # pylint: disable=unsupported-assignment-operation

    process_img(image_ids[0], 0, do_setup=True)
    with ThreadPoolExecutor() as executor:
        for _ in executor.map(process_img, image_ids[1:], range(1, len(image_ids))):
            pass

    return value, mask, (h, w)
