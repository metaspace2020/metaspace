from os.path import join, dirname
from elasticsearch import Elasticsearch
import pytest
from fabric.api import local
from fabric.context_managers import warn_only
from mock import patch
import time

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


@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example(get_compute_img_measures_mock, filter_sf_metrics_mock,
                                  post_images_to_annot_service_mock, MolDBServiceWrapperMock,
                                  sm_config, create_fill_sm_database):
    get_compute_img_measures_mock.return_value = lambda *args: (0.9, 0.9, 0.9)
    filter_sf_metrics_mock.side_effect = lambda x: x
    mol_db_mock = MolDBServiceWrapperMock()
    mol_db_mock.find_db_by_name_version.return_value = [{'id': 0, 'name': 'HMDB', 'version': '2017-01'}]
    mol_db_mock.fetch_db_sfs.return_value = ['C12H24O']
    mol_db_mock.fetch_molecules.return_value = [{'mol_id': 'HMDB0001', 'mol_name': 'molecule name'}]

    url_dict = {
        'ion_image_url': 'http://localhost/ion_image',
        'iso_image_urls': ['http://localhost/iso_image_1', None, None, None]
    }
    post_images_to_annot_service_mock.return_value = {
        (1, '+H'): url_dict,
        (1, '+Na'): url_dict,
        (1, '+K'): url_dict
    }

    SMConfig._config_dict = sm_config

    db = DB(sm_config['db'])
    try:
        job = SearchJob('2000-01-01_00h00m', test_ds_name, True, input_dir_path, '')
        job.run(ds_config_path)

        # dataset meta asserts
        rows = db.select("SELECT id, name, input_path, img_bounds from dataset")
        img_bounds = {u'y': {u'max': 3, u'min': 1}, u'x': {u'max': 3, u'min': 1}}
        input_path = join(dirname(__file__), 'data', test_ds_name)
        assert len(rows) == 1
        assert rows[0] == ('2000-01-01_00h00m', test_ds_name, input_path, img_bounds)

        # theoretical patterns asserts
        rows = db.select('SELECT sf, adduct, centr_mzs, centr_ints '
                         'FROM theor_peaks '
                         'ORDER BY adduct')

        assert len(rows) == 3 + len(DECOY_ADDUCTS)
        for r in rows:
            assert r[2] and r[3]

        # image metrics asserts
        rows = db.select(('SELECT db_id, sf_id, adduct, peaks_n, stats, iso_image_urls, ion_image_url '
                          'FROM iso_image_metrics '
                          'ORDER BY sf_id, adduct'))

        assert rows
        assert rows[0]
        assert tuple(rows[0][:2]) == (0, 1)
        assert set(rows[0][4].keys()) == {'chaos', 'spatial', 'spectral'}
        assert rows[0][5] == ['http://localhost/iso_image_1', None, None, None]
        assert rows[0][6] == 'http://localhost/ion_image'

        # ES asserts
        time.sleep(2)  # Waiting for ES
        es = Elasticsearch(hosts=[{"host": sm_config['elasticsearch']['host'],
                                   "port": int(sm_config['elasticsearch']['port'])}])
        docs = es.search(index=sm_config['elasticsearch']['index'], body={"query": {"match_all": {}}})
        assert ([d['_id'].startswith('2000-01-01_00h00m') for d in docs['hits']['hits']])

    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))
