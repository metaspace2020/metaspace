from mock import patch, mock_open, mock, Mock, MagicMock
import pytest
from scipy.sparse.csr import csr_matrix
import json
from collections import OrderedDict

from engine.search_results import SearchResults, METRICS_INS, insert_sf_iso_imgs_sql
from engine.search_job import DB


db_mock = MagicMock(spec=DB)


@pytest.fixture
def search_results():
    imgs_map = {0: [csr_matrix([[100, 0, 0], [0, 0, 0]]), csr_matrix([[0, 0, 0], [0, 0, 10]])]}
    img_metrics_map = {0: (0.9, 0.9, 0.9)}
    sf_adduct_peaksn = [(1, '+H', 2)]

    return SearchResults(0, 0, 0, imgs_map, img_metrics_map, sf_adduct_peaksn, db_mock)


def test_save_sf_img_metrics_correct_db_call(search_results):
    search_results.store_sf_img_metrics()

    metrics_json = json.dumps(OrderedDict(zip(['chaos', 'img_corr', 'pat_match'], (0.9, 0.9, 0.9))))
    correct_rows = [(0, 0, 1, '+H', 2, metrics_json)]
    db_mock.insert.assert_called_with(METRICS_INS, correct_rows)


def test_save_sf_iso_images_correct_db_call(search_results):
    search_results.store_sf_iso_images(nrows=2, ncols=3)

    correct_rows = [(0, 0, 1, '+H', 0, [0], [100], 0, 100),
                    (0, 0, 1, '+H', 1, [5], [10], 0, 10)]
    db_mock.insert.assert_called_with(insert_sf_iso_imgs_sql, correct_rows)
