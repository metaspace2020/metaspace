import json
from collections import OrderedDict
from os.path import join, dirname
import pandas as pd
import pytest
from mock import MagicMock
import numpy as np

from sm.engine.db import DB
from sm.engine.search_results import SearchResults, METRICS_INS

db_mock = MagicMock(spec=DB)


@pytest.fixture
def search_results():
    metrics = ['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints']
    res = SearchResults(0, 0, metrics)
    # res.metrics = ['chaos', 'spatial', 'spectral']
    return res


def test_save_sf_img_metrics_correct_db_call(search_results):
    ion_img_ids = {(1, '+H'): {'iso_image_ids': ['iso_image_1', None, None, None]}}
    ion_metrics_df = pd.DataFrame([(1, '+H', 0.9, 0.9, 0.9,
                                    [100, 10], [0, 0], [10, 1],
                                    0.9 ** 3, 0.5)],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral',
                                           'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr'])

    search_results.store_ion_metrics(ion_metrics_df, ion_img_ids, db_mock)

    metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints'],
                                              (0.9, 0.9, 0.9, [100, 10], [0, 0], [10, 1]))))
    exp_rows = [(0, 0, 1, '+H', 0.9**3, 0.5, metrics_json, ['iso_image_1', None, None, None], None)]
    db_mock.insert.assert_called_with(METRICS_INS, exp_rows)


def test_non_native_python_number_types_handled(search_results):
    ion_img_ids = {(1, '+H'): {'iso_image_ids': ['iso_image_1', None, None, None]}}
    ion_metrics_df = pd.DataFrame([(1, '+H', 0.9, 0.9, 0.9,
                                    [100, 10], [0, 0], [10, 1],
                                    0.9 ** 3, 0.5)],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral',
                                           'total_iso_ints', 'min_iso_ints', 'max_iso_ints', 'msm', 'fdr'])

    for col in ['chaos', 'spatial', 'spectral', 'msm', 'fdr']:
        ion_metrics_df[col] = ion_metrics_df[col].astype(np.float64)

        search_results.store_ion_metrics(ion_metrics_df, ion_img_ids, db_mock)

        metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral', 'total_iso_ints', 'min_iso_ints', 'max_iso_ints'],
                                                  (0.9, 0.9, 0.9, [100, 10], [0, 0], [10, 1]))))
        exp_rows = [(0, 0, 1, '+H', 0.9 ** 3, 0.5, metrics_json,
                         ['iso_image_1', None, None, None], None)]
        db_mock.insert.assert_called_with(METRICS_INS, exp_rows)
