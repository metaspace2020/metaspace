import logging
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from os import path

import numpy as np
import png
import requests
from requests.adapters import HTTPAdapter
from PIL import Image
from scipy.ndimage import zoom

from sm.engine.util import retry_on_exception

logger = logging.getLogger('engine')


class ImageStoreServiceWrapper:
    def __init__(self, img_service_url):
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
    def post_image(self, storage_type, img_type, fp):
        """
        Args
        ---
        storage_type: str
            db | fs
        img_type: str
            iso_image | optical_image | raw_optical_image | ion_thumbnail
        fp:
            file object

        Returns
        ---
        str
            new image id
        """
        url = self._format_url(storage_type=storage_type, img_type=img_type, method='upload')
        resp = self._session.post(url, files={img_type: fp})
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

        @retry_on_exception()
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


class PngGenerator:
    """ Generator of isotopic images as png files

    Args
    ----------
    mask : numpy.array
        Alpha channel (2D, 0..1)
    """

    def __init__(self, mask, greyscale=True):
        self._greyscale = greyscale
        self._bitdepth = 16 if self._greyscale else 8
        self._mask = mask
        self._shape = mask.shape

        colors = np.array(
            [
                (68, 1, 84),
                (68, 2, 85),
                (68, 3, 87),
                (69, 5, 88),
                (69, 6, 90),
                (69, 8, 91),
                (70, 9, 92),
                (70, 11, 94),
                (70, 12, 95),
                (70, 14, 97),
                (71, 15, 98),
                (71, 17, 99),
                (71, 18, 101),
                (71, 20, 102),
                (71, 21, 103),
                (71, 22, 105),
                (71, 24, 106),
                (72, 25, 107),
                (72, 26, 108),
                (72, 28, 110),
                (72, 29, 111),
                (72, 30, 112),
                (72, 32, 113),
                (72, 33, 114),
                (72, 34, 115),
                (72, 35, 116),
                (71, 37, 117),
                (71, 38, 118),
                (71, 39, 119),
                (71, 40, 120),
                (71, 42, 121),
                (71, 43, 122),
                (71, 44, 123),
                (70, 45, 124),
                (70, 47, 124),
                (70, 48, 125),
                (70, 49, 126),
                (69, 50, 127),
                (69, 52, 127),
                (69, 53, 128),
                (69, 54, 129),
                (68, 55, 129),
                (68, 57, 130),
                (67, 58, 131),
                (67, 59, 131),
                (67, 60, 132),
                (66, 61, 132),
                (66, 62, 133),
                (66, 64, 133),
                (65, 65, 134),
                (65, 66, 134),
                (64, 67, 135),
                (64, 68, 135),
                (63, 69, 135),
                (63, 71, 136),
                (62, 72, 136),
                (62, 73, 137),
                (61, 74, 137),
                (61, 75, 137),
                (61, 76, 137),
                (60, 77, 138),
                (60, 78, 138),
                (59, 80, 138),
                (59, 81, 138),
                (58, 82, 139),
                (58, 83, 139),
                (57, 84, 139),
                (57, 85, 139),
                (56, 86, 139),
                (56, 87, 140),
                (55, 88, 140),
                (55, 89, 140),
                (54, 90, 140),
                (54, 91, 140),
                (53, 92, 140),
                (53, 93, 140),
                (52, 94, 141),
                (52, 95, 141),
                (51, 96, 141),
                (51, 97, 141),
                (50, 98, 141),
                (50, 99, 141),
                (49, 100, 141),
                (49, 101, 141),
                (49, 102, 141),
                (48, 103, 141),
                (48, 104, 141),
                (47, 105, 141),
                (47, 106, 141),
                (46, 107, 142),
                (46, 108, 142),
                (46, 109, 142),
                (45, 110, 142),
                (45, 111, 142),
                (44, 112, 142),
                (44, 113, 142),
                (44, 114, 142),
                (43, 115, 142),
                (43, 116, 142),
                (42, 117, 142),
                (42, 118, 142),
                (42, 119, 142),
                (41, 120, 142),
                (41, 121, 142),
                (40, 122, 142),
                (40, 122, 142),
                (40, 123, 142),
                (39, 124, 142),
                (39, 125, 142),
                (39, 126, 142),
                (38, 127, 142),
                (38, 128, 142),
                (38, 129, 142),
                (37, 130, 142),
                (37, 131, 141),
                (36, 132, 141),
                (36, 133, 141),
                (36, 134, 141),
                (35, 135, 141),
                (35, 136, 141),
                (35, 137, 141),
                (34, 137, 141),
                (34, 138, 141),
                (34, 139, 141),
                (33, 140, 141),
                (33, 141, 140),
                (33, 142, 140),
                (32, 143, 140),
                (32, 144, 140),
                (32, 145, 140),
                (31, 146, 140),
                (31, 147, 139),
                (31, 148, 139),
                (31, 149, 139),
                (31, 150, 139),
                (30, 151, 138),
                (30, 152, 138),
                (30, 153, 138),
                (30, 153, 138),
                (30, 154, 137),
                (30, 155, 137),
                (30, 156, 137),
                (30, 157, 136),
                (30, 158, 136),
                (30, 159, 136),
                (30, 160, 135),
                (31, 161, 135),
                (31, 162, 134),
                (31, 163, 134),
                (32, 164, 133),
                (32, 165, 133),
                (33, 166, 133),
                (33, 167, 132),
                (34, 167, 132),
                (35, 168, 131),
                (35, 169, 130),
                (36, 170, 130),
                (37, 171, 129),
                (38, 172, 129),
                (39, 173, 128),
                (40, 174, 127),
                (41, 175, 127),
                (42, 176, 126),
                (43, 177, 125),
                (44, 177, 125),
                (46, 178, 124),
                (47, 179, 123),
                (48, 180, 122),
                (50, 181, 122),
                (51, 182, 121),
                (53, 183, 120),
                (54, 184, 119),
                (56, 185, 118),
                (57, 185, 118),
                (59, 186, 117),
                (61, 187, 116),
                (62, 188, 115),
                (64, 189, 114),
                (66, 190, 113),
                (68, 190, 112),
                (69, 191, 111),
                (71, 192, 110),
                (73, 193, 109),
                (75, 194, 108),
                (77, 194, 107),
                (79, 195, 105),
                (81, 196, 104),
                (83, 197, 103),
                (85, 198, 102),
                (87, 198, 101),
                (89, 199, 100),
                (91, 200, 98),
                (94, 201, 97),
                (96, 201, 96),
                (98, 202, 95),
                (100, 203, 93),
                (103, 204, 92),
                (105, 204, 91),
                (107, 205, 89),
                (109, 206, 88),
                (112, 206, 86),
                (114, 207, 85),
                (116, 208, 84),
                (119, 208, 82),
                (121, 209, 81),
                (124, 210, 79),
                (126, 210, 78),
                (129, 211, 76),
                (131, 211, 75),
                (134, 212, 73),
                (136, 213, 71),
                (139, 213, 70),
                (141, 214, 68),
                (144, 214, 67),
                (146, 215, 65),
                (149, 215, 63),
                (151, 216, 62),
                (154, 216, 60),
                (157, 217, 58),
                (159, 217, 56),
                (162, 218, 55),
                (165, 218, 53),
                (167, 219, 51),
                (170, 219, 50),
                (173, 220, 48),
                (175, 220, 46),
                (178, 221, 44),
                (181, 221, 43),
                (183, 221, 41),
                (186, 222, 39),
                (189, 222, 38),
                (191, 223, 36),
                (194, 223, 34),
                (197, 223, 33),
                (199, 224, 31),
                (202, 224, 30),
                (205, 224, 29),
                (207, 225, 28),
                (210, 225, 27),
                (212, 225, 26),
                (215, 226, 25),
                (218, 226, 24),
                (220, 226, 24),
                (223, 227, 24),
                (225, 227, 24),
                (228, 227, 24),
                (231, 228, 25),
                (233, 228, 25),
                (236, 228, 26),
                (238, 229, 27),
                (241, 229, 28),
                (243, 229, 30),
                (246, 230, 31),
                (248, 230, 33),
                (250, 230, 34),
                (253, 231, 36),
            ],
            dtype=np.float,
        )
        self._colors = np.c_[colors, np.ones_like(colors[:, 0])]

    def _to_image(self, array):
        image = ((array - array.min()) / (array.max() - array.min())) * (2 ** self._bitdepth - 1)
        if self._greyscale:
            grey = np.empty(shape=image.shape + (2,), dtype=np.uint16)
            grey[:, :, 0] = image.astype(np.uint16)
            grey[:, :, 1] = (self._mask * (2 ** self._bitdepth - 1)).astype(np.uint16)
            image = grey
        else:
            rgba = np.empty(shape=image.shape + (4,), dtype=self._colors.dtype)
            self._colors.take(image.astype(np.uint8), axis=0, mode='clip', out=rgba)
            rgba[:, :, 3] = self._mask * (2 ** self._bitdepth - 1)
            image = rgba
        return image

    def generate_png(self, array):
        img = self._to_image(array)
        fp = BytesIO()
        png_writer = png.Writer(
            width=self._shape[1],
            height=self._shape[0],
            alpha=True,
            greyscale=self._greyscale,
            bitdepth=self._bitdepth,
        )
        png_writer.write(fp, img.reshape(img.shape[0], img.shape[1] * img.shape[2]).tolist())
        fp.seek(0)
        return fp
