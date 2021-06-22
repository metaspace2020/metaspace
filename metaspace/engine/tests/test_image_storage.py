import io

import PIL.Image
import numpy as np
import botocore.exceptions
import pytest

from sm.engine import image_storage
from sm.engine.storage import get_s3_bucket


@pytest.fixture(autouse=True, scope='module')
def clean_storage(sm_config):
    yield
    get_s3_bucket(sm_config['image_storage']['bucket'], sm_config).objects.all().delete()


def make_test_image_bytes() -> bytes:
    array = np.array([[0, 0], [1, 1], [2, 2]])
    image = PIL.Image.fromarray(array.astype(np.uint16))
    fp = io.BytesIO()
    image.save(fp, format='PNG')
    fp.seek(0)
    return fp.read()


def test_post_get_image_success():
    test_image_bytes = make_test_image_bytes()

    image_id = image_storage.post_image(image_storage.ISO, "ds-id", test_image_bytes)
    fetched_image_bytes = image_storage.get_image(image_storage.ISO, "ds-id", image_id)

    assert fetched_image_bytes == test_image_bytes


def assert_no_image(image_id):
    try:
        image_storage.get_image(image_storage.ISO, "ds-id", image_id)
    except botocore.exceptions.ClientError as error:
        assert error.response['Error']['Code'] == 'NoSuchKey'


def test_get_image_wrong_id():
    assert_no_image('wrong-id')


def test_delete_image_success():
    test_image_bytes = make_test_image_bytes()
    image_id = image_storage.post_image(image_storage.ISO, "ds-id", test_image_bytes)

    image_storage.delete_image(image_storage.ISO, "ds-id", image_id)

    assert_no_image(image_id)

    # delete non-existing image should not raise exception
    image_storage.delete_image(image_storage.ISO, "ds-id", image_id)
