from os.path import join, dirname
from elasticsearch import Elasticsearch
import pytest
from fabric.api import local
from fabric.context_managers import warn_only
from mock import patch

from sm.engine.db import DB
from sm.engine.search_job import SearchJob
from sm.engine.util import SMConfig
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.es_export import ESExporter
from sm.engine.tests.util import create_test_db, drop_test_db, sm_config, create_sm_index

test_ds_name = 'imzml_example_ds'

proj_dir_path = dirname(dirname(__file__))
data_dir_path = join(sm_config()["fs"]["base_path"], test_ds_name)
input_dir_path = join(proj_dir_path, 'tests/data/imzml_example_ds')
ds_config_path = join(input_dir_path, 'config.json')


@pytest.fixture()
def create_fill_sm_database(create_test_db, drop_test_db, create_sm_index, sm_config):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO formula_db VALUES (%s, %s, %s)',
                  [(0, '2016-01-01', 'HMDB')])
        db.insert('INSERT INTO formula VALUES (%s, %s, %s, %s, %s)',
                  [(100, 0, '00001', 'compound_name', 'C12H24O')])
        db.insert('INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)',
                  [(10007, 0, 'C12H24O', ['00001'], ['compound_name'])])
    except:
        raise
    finally:
        db.close()


@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example(get_compute_img_measures_mock, filter_sf_metrics_mock,
                                  create_fill_sm_database, sm_config):
    get_compute_img_measures_mock.return_value = lambda *args: (0.9, 0.9, 0.9)
    filter_sf_metrics_mock.side_effect = lambda x: x

    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    try:
        job = SearchJob('2000-01-01_00h00m', test_ds_name)
        job.run(input_dir_path, ds_config_path, clean=True)

        # dataset meta asserts
        rows = db.select("SELECT id, name, input_path, img_bounds from dataset")
        img_bounds = {u'y': {u'max': 3, u'min': 1}, u'x': {u'max': 3, u'min': 1}}
        input_path = join(dirname(__file__), 'data', test_ds_name)
        assert len(rows) == 1
        assert rows[0] == ('2000-01-01_00h00m', test_ds_name, input_path, img_bounds)

        # theoretical patterns asserts
        rows = db.select('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints '
                         'FROM theor_peaks '
                         'ORDER BY adduct')

        assert len(rows) == 3 + len(DECOY_ADDUCTS)
        for r in rows:
            assert r[3] and r[4]

        # image metrics asserts
        rows = db.select(('SELECT db_id, sf_id, adduct, peaks_n, stats FROM iso_image_metrics '
                          'ORDER BY sf_id, adduct'))

        assert rows
        assert rows[0]
        assert tuple(rows[0][:2]) == (0, 10007)
        assert set(rows[0][4].keys()) == {'chaos', 'spatial', 'spectral'}

        # image asserts
        rows = db.select(('SELECT db_id, sf_id, adduct, peak, intensities, min_int, max_int '
                          'FROM iso_image '
                          'ORDER BY sf_id, adduct'))
        assert rows

        max_int = 0.0
        for r in rows:
            max_int = max(max_int, r[-1])
            assert tuple(r[:2]) == (0, 10007)
        assert max_int

        # ES asserts
        es = Elasticsearch(hosts=[{"host": sm_config['elasticsearch']['host']}])
        docs = es.search(index=sm_config['elasticsearch']['index'], body={"query" : {"match_all" : {}}})
        assert ([d['_id'].startswith('2000-01-01_00h00m') for d in docs['hits']['hits']])

    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))
