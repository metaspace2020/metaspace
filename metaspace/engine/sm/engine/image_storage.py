from __future__ import annotations

import json
import logging
import uuid
from concurrent.futures.thread import ThreadPoolExecutor
from enum import Enum
from io import BytesIO
from time import sleep
from typing import List, Tuple, Callable, Dict, Protocol, Union, TYPE_CHECKING

import PIL.Image
import numpy as np
from botocore.exceptions import ClientError
from scipy.ndimage import zoom

from sm.engine.config import SMConfig
from sm.engine.storage import get_s3_resource, create_bucket, get_s3_client
from sm.engine.utils.retry_on_exception import retry_on_exception

if TYPE_CHECKING:
    from mypy_boto3_s3.service_resource import S3ServiceResource
    from mypy_boto3_s3.client import S3Client
else:
    S3ServiceResource = object
    S3Client = object


logger = logging.getLogger('engine')


class ImageType(str, Enum):
    ISO = 'iso'
    OPTICAL = 'optical'
    RAW = 'raw_optical'
    THUMB = 'thumb'
    DIAG = 'diag'


class ImageStorage:
    ISO = ImageType.ISO
    OPTICAL = ImageType.OPTICAL
    RAW = ImageType.RAW
    THUMB = ImageType.THUMB
    DIAG = ImageType.DIAG

    def __init__(self, sm_config: Dict = None):
        sm_config = sm_config or SMConfig.get_conf()
        logger.info(f'Initializing image storage from config: {sm_config["image_storage"]}')
        self.s3: S3ServiceResource = get_s3_resource(sm_config)
        self.s3_client: S3Client = self.s3.meta.client
        self.bucket = self.s3.Bucket(sm_config['image_storage']['bucket'])
        self.raw_img_bucket = self.s3.Bucket(sm_config['image_storage']['raw_img_bucket'])

    @staticmethod
    def _make_key(image_type, ds_id, img_id):
        return f'{image_type}/{ds_id}/{img_id}'

    def _get_object(self, image_type, ds_id, img_id):
        key = self._make_key(image_type, ds_id, img_id)

        if image_type == self.RAW:
            return self.raw_img_bucket.Object(key)

        return self.bucket.Object(key)

    @staticmethod
    def _gen_id() -> str:
        return uuid.uuid4().hex

    def post_image(
        self, image_type: ImageType, ds_id: str, image_bytes: Union[bytes, BytesIO]
    ) -> str:
        img_id = self._gen_id()
        obj = self._get_object(image_type, ds_id, img_id)
        try:
            obj.put(Body=image_bytes)
        except ClientError as e:
            if 'SlowDown' in str(e):
                logger.warning('Uploading images too fast. Trying again in 5 seconds')
                sleep(5)
                obj.put(Body=image_bytes)
            else:
                raise e
        return img_id

    def get_image(self, image_type: ImageType, ds_id: str, image_id: str) -> bytes:
        obj = self._get_object(image_type, ds_id, image_id)
        return obj.get()['Body'].read()

    def delete_image(self, image_type: ImageType, ds_id: str, image_id: str):
        obj = self._get_object(image_type, ds_id, image_id)
        obj.delete()

    def delete_images(self, image_type: ImageType, ds_id: str, image_ids: List[str]):
        with ThreadPoolExecutor() as executor:
            for _ in executor.map(
                lambda image_id: self.delete_image(image_type, ds_id, image_id), image_ids
            ):
                pass

    def get_image_url(self, image_type: ImageType, ds_id: str, image_id: str) -> str:
        endpoint = self.s3_client.meta.endpoint_url
        key = self._make_key(image_type, ds_id, image_id)

        if image_type == self.RAW:
            return f'{endpoint}/{self.raw_img_bucket.name}/{key}'

        return f'{endpoint}/{self.bucket.name}/{key}'

    def get_ion_images_for_analysis(
        self,
        ds_id: str,
        image_ids: List[str],
        hotspot_percentile: int = 99,
        max_size: Tuple[int, int] = None,
        max_mem_mb: int = 2048,
    ):
        """Retrieves ion images, does hot-spot removal and resizing,
        and returns them as numpy array.

        Args:
            ds_id:
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
            img_bytes = self.get_image(self.ISO, ds_id, img_id)
            img = PIL.Image.open(BytesIO(img_bytes))
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


class _GetIonImagesForAnalysis(Protocol):
    def __call__(
        self,
        ds_id: str,
        image_ids: List[str],
        hotspot_percentile: int = 99,
        max_size: Tuple[int, int] = None,
        max_mem_mb: int = 2048,
    ) -> Tuple[np.ndarray, np.ndarray, Tuple[int, int]]:
        ...


# pylint: disable=invalid-name
_instance: ImageStorage

ISO = ImageType.ISO
OPTICAL = ImageType.OPTICAL
THUMB = ImageType.THUMB
DIAG = ImageType.DIAG
RAW = ImageType.RAW

get_image: Callable[[ImageType, str, str], bytes]
post_image: Callable[[ImageType, str, Union[bytes, BytesIO]], str]
delete_image: Callable[[ImageType, str, str], None]
delete_images: Callable[[ImageType, str, List[str]], None]
get_image_url: Callable[[ImageType, str, str], str]
get_ion_images_for_analysis: _GetIonImagesForAnalysis


@retry_on_exception(ClientError)
def configure_bucket(sm_config: Dict):
    """Creates the image storage bucket if needed and sets the ACL."""
    bucket_name = sm_config['image_storage']['bucket']
    logger.info(f'Configuring image storage bucket: {bucket_name}')

    s3_client = get_s3_client(sm_config)
    create_bucket(bucket_name, s3_client)

    bucket_policy = {
        'Version': '2012-10-17',
        'Statement': [
            {
                'Effect': 'Allow',
                'Principal': {'AWS': ['*']},
                'Action': ['s3:GetObject'],
                'Resource': [f'arn:aws:s3:::{bucket_name}/*'],
            }
        ],
    }
    s3_client.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(bucket_policy))

    is_s3_bucket = 'aws' in sm_config  # False when minio is used instead of AWS S3
    if is_s3_bucket:
        cors_configuration = {
            'CORSRules': [
                {
                    'AllowedHeaders': ['*'],
                    'AllowedMethods': ['GET'],
                    'AllowedOrigins': ['*'],
                    'MaxAgeSeconds': 3000,
                }
            ]
        }
        s3_client.put_bucket_cors(Bucket=bucket_name, CORSConfiguration=cors_configuration)


def init(sm_config: Dict):
    # pylint: disable=global-statement
    global _instance, get_image, post_image, delete_image, delete_images
    global get_image_url, get_ion_images_for_analysis
    _instance = ImageStorage(sm_config)
    get_image = _instance.get_image
    post_image = _instance.post_image
    delete_image = _instance.delete_image
    delete_images = _instance.delete_images
    get_image_url = _instance.get_image_url
    get_ion_images_for_analysis = _instance.get_ion_images_for_analysis
