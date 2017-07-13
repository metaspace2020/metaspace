from __future__ import unicode_literals
from os.path import join, dirname
import pytest
from fabric.api import local
from fabric.context_managers import warn_only
from mock import patch, MagicMock
import time

from sm.engine.db import DB
from sm.engine.errors import JobFailedError
from sm.engine.search_job import SearchJob
from sm.engine.util import SMConfig
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.dataset_manager import DS_INSERT
from sm.engine.tests.util import test_db, sm_config, sm_index, es_dsl_search

test_ds_name = 'imzml_example_ds'

proj_dir_path = dirname(dirname(__file__))
data_dir_path = join(sm_config()["fs"]["base_path"], test_ds_name)
input_dir_path = join(proj_dir_path, 'tests/data/imzml_example_ds')
ds_config_path = join(input_dir_path, 'config.json')


@pytest.fixture()
def create_fill_sm_database(test_db, sm_index, sm_config):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))


def init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock):
    mol_db_wrapper_mock = MolDBServiceWrapperMock()
    mol_db_wrapper_mock.find_db_by_name_version.return_value = [{'id': 0, 'name': 'HMDB', 'version': '2016'}]
    mol_db_wrapper_mock.find_db_by_id.return_value = {'id': 0, 'name': 'HMDB', 'version': '2016'}
    mol_db_wrapper_mock.fetch_db_sfs.return_value = ['C12H24O']
    mol_db_wrapper_mock.fetch_molecules.return_value = [{'sf': 'C12H24O', 'mol_id': 'HMDB0001',
                                                         'mol_name': 'molecule name'}]


@patch('sm.engine.search_job.MolDBServiceWrapper')
@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                  post_images_to_annot_service_mock, MolDBServiceWrapperMock, MolDBServiceWrapperMock2,
                                  sm_config, create_fill_sm_database, es_dsl_search):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock2)

    get_compute_img_metrics_mock.return_value = lambda *args: (0.9, 0.9, 0.9, [100.], [0], [10.])
    filter_sf_metrics_mock.side_effect = lambda x: x

    url_dict = {
        'iso_image_ids': ['iso_image_1', None, None, None]
    }
    post_images_to_annot_service_mock.return_value = {
        (1, '+H'): url_dict,
        (1, '+Na'): url_dict,
        (1, '+K'): url_dict
    }

    db = DB(sm_config['db'])

    try:
        ds_config_str = open(ds_config_path).read()
        db.insert(DS_INSERT, [('2000-01-01_00h00m', test_ds_name, input_dir_path, '{}', ds_config_str, 'QUEUED')])

        job = SearchJob('conf/test_config.json')

        job.run('2000-01-01_00h00m')

        # dataset table asserts
        rows = db.select("SELECT id, name, input_path, status from dataset")
        input_path = join(dirname(__file__), 'data', test_ds_name)
        assert len(rows) == 1
        assert rows[0] == ('2000-01-01_00h00m', test_ds_name, input_path, 'FINISHED')

        # job table asserts
        rows = db.select("SELECT db_id, ds_id, status, start, finish from job")
        assert len(rows) == 1
        db_id, ds_id, status, start, finish = rows[0]
        assert (db_id, ds_id, status) == (0, '2000-01-01_00h00m', 'FINISHED')
        assert start < finish

        # theoretical patterns asserts
        rows = db.select('SELECT sf, adduct, centr_mzs, centr_ints '
                         'FROM theor_peaks '
                         'ORDER BY adduct')

        assert len(rows) == 3 + len(DECOY_ADDUCTS)
        for r in rows:
            assert r[2] and r[3]

        # image metrics asserts
        rows = db.select(('SELECT db_id, sf_id, adduct, stats, iso_image_urls, ion_image_url '
                          'FROM iso_image_metrics '
                          'ORDER BY sf_id, adduct'))

        assert rows[0] == (0, 1, '+K', {'chaos': 0.9, 'spatial': 0.9, 'spectral': 0.9,
                                        'total_iso_ints': [100.], 'min_iso_ints': [0], 'max_iso_ints': [10.]},
                           ['iso_image_1', None, None, None], None)
        assert rows[1] == (0, 1, '+Na', {'chaos': 0.9, 'spatial': 0.9, 'spectral': 0.9,
                                         'total_iso_ints': [100.], 'min_iso_ints': [0], 'max_iso_ints': [10.]},
                           ['iso_image_1', None, None, None], None)

        # ES asserts
        time.sleep(1)  # Waiting for ES
        docs = es_dsl_search.query().execute()['hits']['hits']
        for doc in docs:
            assert doc['_id'].startswith('2000-01-01_00h00m')

    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))


@patch('sm.engine.search_job.MolDBServiceWrapper')
@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example_fails(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                        post_images_to_annot_service_mock,
                                        MolDBServiceWrapperMock, MolDBServiceWrapperMock2,
                                        sm_config, create_fill_sm_database, es_dsl_search):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock2)

    def throw_exception_function(*args):
        raise Exception('Test')
    get_compute_img_metrics_mock.return_value = throw_exception_function
    filter_sf_metrics_mock.side_effect = lambda x: x

    url_dict = {
        'iso_image_ids': ['iso_image_1', None, None, None]
    }
    post_images_to_annot_service_mock.return_value = {
        (1, '+H'): url_dict,
        (1, '+Na'): url_dict,
        (1, '+K'): url_dict
    }

    db = DB(sm_config['db'])

    try:
        ds_config_str = open(ds_config_path).read()
        db.insert(DS_INSERT, [('2000-01-01_00h00m', test_ds_name, input_dir_path, '{}', ds_config_str, 'QUEUED')])

        job = SearchJob('conf/test_config.json')
        job.run('2000-01-01_00h00m')
    except JobFailedError as e:
        assert e
        # dataset table asserts
        rows = db.select("SELECT status from dataset")
        assert len(rows) == 1
        assert rows[0][0] == 'FAILED'
    else:
        raise AssertionError('JobFailedError should be raised')
    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))