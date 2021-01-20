import logging
from concurrent.futures.thread import ThreadPoolExecutor
from io import BytesIO
from os import path

import numpy as np
import requests
from PIL import Image
from requests.adapters import HTTPAdapter
from scipy.ndimage import zoom

from sm.engine.util import SMConfig, retry_on_exception

logger = logging.getLogger('engine')


class ImageStoreServiceWrapper:
    def __init__(self, img_service_url=None):
        if img_service_url is None:
            img_service_url = SMConfig.get_conf()['services']['img_service_url']
        self._img_service_url = img_service_url
        self._session = requests.Session()
        self._session.mount(
            self._img_service_url, HTTPAdapter(max_retries=5, pool_maxsize=50, pool_block=True)
        )

    def _format_url(self, storage_type, img_type, method='', img_id=''):
        assert storage_type, 'Wrong storage_type: %s' % storage_type
        assert img_type, 'Wrong img_type: %s' % img_type
        return path.join(self._img_service_url, storage_type, img_type + 's', method, img_id)

    @retry_on_exception()
    def post_image(self, storage_type: str, img_type: str, img_bytes: bytes) -> str:
        """
        Args:
            storage_type: db | fs
            img_type: iso_image | optical_image | raw_optical_image | ion_thumbnail
            img_bytes: bytes of image saved as PNG

        Returns:
            new image id
        """
        url = self._format_url(storage_type=storage_type, img_type=img_type, method='upload')
        resp = self._session.post(url, files={img_type: img_bytes})
        resp.raise_for_status()
        return resp.json()['image_id']

    @retry_on_exception()
    def delete_image(self, url):
        resp = self._session.delete(url)
        if resp.status_code != 202:
            print(
                'Failed to delete: {}'.format(url)
            )  # logger has issues with pickle when sent to spark

    @retry_on_exception()
    def get_image_by_id(self, storage_type, img_type, img_id):
        """
        Args
        ---
        storage_type: str
            db | fs
        img_type: str
            iso_image | optical_image | raw_optical_image | ion_thumbnail
        img_id: str

        Returns
        ---
        Image.Image
        """
        url = self._format_url(storage_type=storage_type, img_type=img_type, img_id=img_id)
        try:
            response = self._session.get(url)
            response.raise_for_status()
            return Image.open(BytesIO(response.content))
        except Exception:
            logger.error(f'get_image_by_id: Error getting url {url}')
            raise

    def get_ion_images_for_analysis(
        self, storage_type, img_ids, hotspot_percentile=99, max_size=None, max_mem_mb=2048
    ):
        """Retrieves ion images, does hot-spot removal and resizing,
        and returns them as numpy array.

        Args:
            storage_type (str):
            img_ids (list[str]):
            hotspot_percentile (float):
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
        assert all(img_ids)

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
                expected_mem = img_h * img_w * len(img_ids) * 4 / 1024 / 1024
                zoom_factor = min(zoom_factor, max_mem_mb / expected_mem)

            raw_mask = np.float32(np.array(img)[:, :, 3] != 0)
            if abs(zoom_factor - 1) < 0.001:
                zoom_factor = 1
                mask = raw_mask
            else:
                mask = zoom(raw_mask, zoom_factor, prefilter=False)

            h, w = mask.shape
            value = np.empty((len(img_ids), h * w), dtype=np.float32)

        def process_img(img_id, idx, do_setup=False):
            img = self.get_image_by_id(storage_type, 'iso_image', img_id)
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

        process_img(img_ids[0], 0, do_setup=True)
        with ThreadPoolExecutor() as executor:
            for _ in executor.map(process_img, img_ids[1:], range(1, len(img_ids))):
                pass

        return value, mask, (h, w)

    @retry_on_exception()
    def delete_image_by_id(self, storage_type, img_type, img_id):
        url = self._format_url(
            storage_type=storage_type, img_type=img_type, method='delete', img_id=img_id
        )
        self.delete_image(url)

    def __str__(self):
        return self._img_service_url
