import json
from collections import OrderedDict
from os.path import join, dirname
import pandas as pd
import pytest
from unittest.mock import MagicMock
import numpy as np

from sm.engine.db import DB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.search_results import SearchResults, METRICS_INS
from sm.engine.tests.util import pysparkling_context as spark_context
from scipy.sparse import coo_matrix as coo

db_mock = MagicMock(spec=DB)


@pytest.fixture
def search_results():
    metrics = ['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints']
    res = SearchResults(0, 0, metrics)
    # res.metrics = ['chaos', 'spatial', 'spectral']
    return res


def test_save_sf_img_metrics_correct_db_call(search_results):
    ion_img_ids = {13: {'iso_image_ids': ['iso_image_1', None, None, None]}}
    ion_metrics_df = (pd.DataFrame([(13, 'H2O', '+H', 0.9, 0.9, 0.9,
                                     [100, 10], [0, 0], [10, 1],
                                     0.9 ** 3, 0.5)],
                                   columns=['ion_i', 'sf', 'adduct', 'chaos', 'spatial', 'spectral',
                                            'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr'])
                      .set_index('ion_i'))

    search_results.store_ion_metrics(ion_metrics_df, ion_img_ids, db_mock)

    metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints'],
                                              (0.9, 0.9, 0.9, [100, 10], [0, 0], [10, 1]))))
    exp_rows = [(0, 0, 'H2O', '+H', 0.9**3, 0.5, metrics_json, ['iso_image_1', None, None, None])]
    db_mock.insert.assert_called_with(METRICS_INS, exp_rows)


def test_isotope_images_are_stored(search_results, spark_context):
    mask = np.array([[1, 1], [1, 0]])
    IMG_ID = "iso_image_id"
    img_store_mock = MagicMock(spec=ImageStoreServiceWrapper)
    img_store_mock.post_image.return_value = IMG_ID

    img_store_mock.reset_mock()
    ion_iso_images = spark_context.parallelize([
        (0, [ coo([[0, 0], [0, 1]]), None, coo([[2, 3], [1, 0]]), None ]),
        (1, [ coo([[1, 1], [0, 1]]), None, None, None])
    ])
    ids = search_results.post_images_to_image_store(ion_iso_images, mask, img_store_mock, 'fs')
    assert ids == { 0: {'iso_image_ids': [IMG_ID, None, IMG_ID, None]}, 1: {'iso_image_ids': [IMG_ID, None, None, None]} }
    assert img_store_mock.post_image.call_count == 3


def test_non_native_python_number_types_handled(search_results):
    ion_img_ids = {13: {'iso_image_ids': ['iso_image_1', None, None, None]}}
    ion_metrics_df = (pd.DataFrame([(13, 'H2O', '+H', 0.9, 0.9, 0.9,
                                    [100, 10], [0, 0], [10, 1],
                                    0.9 ** 3, 0.5)],
                                   columns=['ion_i','sf', 'adduct', 'chaos', 'spatial', 'spectral',
                                            'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr'])
                          .set_index('ion_i'))

    for col in ['chaos', 'spatial', 'spectral', 'msm', 'fdr']:
        ion_metrics_df[col] = ion_metrics_df[col].astype(np.float64)

        search_results.store_ion_metrics(ion_metrics_df, ion_img_ids, db_mock)

        metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints'],
                                                  (0.9, 0.9, 0.9, [100, 10], [0, 0], [10, 1]))))
        exp_rows = [(0, 0, 'H2O', '+H', 0.9 ** 3, 0.5, metrics_json,
                     ['iso_image_1', None, None, None])]
        db_mock.insert.assert_called_with(METRICS_INS, exp_rows)
