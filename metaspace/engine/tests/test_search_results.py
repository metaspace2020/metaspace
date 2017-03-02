import json
from collections import OrderedDict
from os.path import join, dirname
import pandas as pd
import pytest
from fabric.api import local
from mock import MagicMock
from scipy.sparse.csr import csr_matrix
import numpy as np

from sm.engine.db import DB
from sm.engine.search_results import SearchResults, METRICS_INS
from sm.engine.tests.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db

db_mock = MagicMock(spec=DB)


@pytest.fixture
def search_results(spark_context, sm_config, ds_config):
    metrics = ['chaos', 'spatial', 'spectral']
    res = SearchResults(0, 0, metrics, None, db_mock)
    res.metrics = ['chaos', 'spatial', 'spectral']
    return res


def test_save_sf_img_metrics_correct_db_call(search_results):
    ion_img_urls = {(1, '+H'): {'iso_image_urls': ['http://localhost/iso_image_1', None, None, None],
                                'ion_image_url': 'http://localhost/ion_image'}}
    ion_metrics_df = pd.DataFrame([(1, '+H', 0.9, 0.9, 0.9, 0.9 ** 3, 0.5)],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral', 'msm', 'fdr'])

    search_results.store_ion_metrics(ion_metrics_df, ion_img_urls)

    metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral'], (0.9, 0.9, 0.9))))
    correct_rows = [(0, 0, 1, '+H', 0.9**3, 0.5, metrics_json, None,
                     ['http://localhost/iso_image_1', None, None, None], 'http://localhost/ion_image')]
    db_mock.insert.assert_called_with(METRICS_INS, correct_rows)


@pytest.fixture()
def create_fill_sm_database(create_test_db, drop_test_db, sm_config):
    proj_dir_path = dirname(dirname(__file__))
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO dataset VALUES (%s, %s, %s, %s, %s)',
                  [('2000-01-01_00:00', 'name', 'input_path', json.dumps({}), json.dumps({}))])
        db.insert('INSERT INTO job VALUES (%s, %s, %s, %s, %s, %s)',
                  [(0, 0, '2000-01-01_00:00', '', None, None)])
    except:
        raise
    finally:
        db.close()


def test_non_native_python_number_types_handled(search_results):
    ion_img_urls = {(1, '+H'): {'iso_image_urls': ['http://localhost/iso_image_1', None, None, None],
                                'ion_image_url': 'http://localhost/ion_image'}}
    ion_metrics_df = pd.DataFrame([(1, '+H', 0.9, 0.9, 0.9, 0.9 ** 3, 0.5)],
                                  columns=['sf_id', 'adduct', 'chaos', 'spatial', 'spectral', 'msm', 'fdr'])

    for col in ['chaos', 'spatial', 'spectral', 'msm', 'fdr']:
        ion_metrics_df[col] = ion_metrics_df[col].astype(np.float64)

        search_results.store_ion_metrics(ion_metrics_df, ion_img_urls)

        metrics_json = json.dumps(OrderedDict(zip(['chaos', 'spatial', 'spectral'], (0.9, 0.9, 0.9))))
        correct_rows = [(0, 0, 1, '+H', 0.9 ** 3, 0.5, metrics_json, None,
                         ['http://localhost/iso_image_1', None, None, None], 'http://localhost/ion_image')]
        db_mock.insert.assert_called_with(METRICS_INS, correct_rows)
