from os.path import join, dirname
from pathlib import Path

import pytest
from fabric.api import local
from fabric.context_managers import warn_only
from unittest.mock import patch, MagicMock
import time
from datetime import datetime

from sm.engine.db import DB
from sm.engine.errors import JobFailedError, ESExportFailedError
from sm.engine.search_job import SearchJob
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.dataset import Dataset
from sm.engine.dataset_manager import DatasetStatus
from sm.engine.tests.util import test_db, sm_config, sm_index, es, es_dsl_search

test_ds_name = 'imzml_example_ds'

proj_dir_path = dirname(dirname(__file__))
data_dir_path = join(sm_config()["fs"]["base_path"], test_ds_name)
input_dir_path = join(proj_dir_path, 'tests/data/imzml_example_ds')
ds_config_path = join(input_dir_path, 'config.json')


@pytest.fixture()
def create_fill_sm_database(test_db, sm_index, sm_config):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))


@pytest.fixture()
def clean_isotope_storage(sm_config):
    with warn_only():
        local('rm -rf {}'.format(sm_config['isotope_storage']['path']))


def init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock):
    mol_db_wrapper_mock = MolDBServiceWrapperMock()
    mol_db_wrapper_mock.find_db_by_name_version.return_value = [{'id': 0, 'name': 'HMDB-v4', 'version': '2018'}]
    mol_db_wrapper_mock.find_db_by_id.return_value = {'id': 0, 'name': 'HMDB-v4', 'version': '2018'}
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
                                  sm_config, create_fill_sm_database, es_dsl_search, clean_isotope_storage):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock2)

    get_compute_img_metrics_mock.return_value = lambda *args: (0.9, 0.9, 0.9, [100.], [0], [10.])
    filter_sf_metrics_mock.side_effect = lambda x: x

    url_dict = {
        'iso_image_ids': ['iso_image_1', None, None, None]
    }
    post_images_to_annot_service_mock.return_value = {
        35: url_dict,
        44: url_dict
    }

    db = DB(sm_config['db'])

    try:
        ds_config_str = open(ds_config_path).read()
        upload_dt = datetime.now()
        ds_id = '2000-01-01_00h00m'
        db.insert(Dataset.DS_INSERT, [(ds_id, test_ds_name, input_dir_path, upload_dt,
                                       '{}', ds_config_str, DatasetStatus.QUEUED, True, ['HMDB-v4'])])
        job = SearchJob()
        job._sm_config['rabbitmq'] = {}  # avoid talking to RabbitMQ during the test
        ds = Dataset.load(db, ds_id)
        job.run(ds)

        # dataset table asserts
        rows = db.select("SELECT id, name, input_path, upload_dt, status from dataset")
        input_path = join(dirname(__file__), 'data', test_ds_name)
        assert len(rows) == 1
        assert rows[0] == (ds_id, test_ds_name, input_path, upload_dt, DatasetStatus.FINISHED)

        # job table asserts
        rows = db.select("SELECT db_id, ds_id, status, start, finish from job")
        assert len(rows) == 1
        db_id, ds_id, status, start, finish = rows[0]
        assert (db_id, ds_id, status) == (0, '2000-01-01_00h00m', 'FINISHED')
        assert start < finish

        # image metrics asserts
        rows = db.select(('SELECT db_id, sf, adduct, stats, iso_image_ids '
                          'FROM iso_image_metrics '
                          'ORDER BY sf, adduct'))

        assert rows[0] == (0, 'C12H24O', '+K', {'chaos': 0.9, 'spatial': 0.9, 'spectral': 0.9,
                                                'total_iso_ints': [100.], 'min_iso_ints': [0], 'max_iso_ints': [10.]},
                           ['iso_image_1', None, None, None])
        assert rows[1] == (0, 'C12H24O', '+Na', {'chaos': 0.9, 'spatial': 0.9, 'spectral': 0.9,
                                                 'total_iso_ints': [100.], 'min_iso_ints': [0], 'max_iso_ints': [10.]},
                           ['iso_image_1', None, None, None])

        time.sleep(1)  # Waiting for ES
        # ES asserts
        ds_docs = es_dsl_search.query('term', _type='dataset').execute().to_dict()['hits']['hits']
        assert 1 == len(ds_docs)
        ann_docs = es_dsl_search.query('term', _type='annotation').execute().to_dict()['hits']['hits']
        assert len(ann_docs) == len(rows)
        for doc in ann_docs:
            assert doc['_id'].startswith(ds_id)

    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))


@patch('sm.engine.search_job.MolDBServiceWrapper')
@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example_annotation_job_fails(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                                       post_images_to_annot_service_mock,
                                                       MolDBServiceWrapperMock, MolDBServiceWrapperMock2,
                                                       sm_config, create_fill_sm_database, es_dsl_search,
                                                       clean_isotope_storage):
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
        35: url_dict,
        44: url_dict
    }

    db = DB(sm_config['db'])

    try:
        ds_id = '2000-01-01_00h00m'
        upload_dt = datetime.now()
        ds_config_str = open(ds_config_path).read()
        db.insert(Dataset.DS_INSERT, [(ds_id, test_ds_name, input_dir_path, upload_dt.isoformat(' '),
                                       '{}', ds_config_str, DatasetStatus.QUEUED, True, ['HMDB-v4'])])

        job = SearchJob()
        ds = Dataset.load(db, ds_id)
        job.run(ds)
    except JobFailedError as e:
        assert e
        # dataset table asserts
        row = db.select_one("SELECT status from dataset")
        assert row[0] == 'FAILED'
    else:
        raise AssertionError('JobFailedError should be raised')
    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))


@patch('sm.engine.search_job.MolDBServiceWrapper')
@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_search_job_imzml_example_es_export_fails(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                                  post_images_to_annot_service_mock,
                                                  MolDBServiceWrapperMock, MolDBServiceWrapperMock2,
                                                  sm_config, create_fill_sm_database, es_dsl_search,
                                                  clean_isotope_storage):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock2)

    get_compute_img_metrics_mock.return_value = lambda *args: (0.9, 0.9, 0.9, [100.], [0], [10.])
    filter_sf_metrics_mock.side_effect = lambda x: x

    url_dict = {
        'iso_image_ids': ['iso_image_1', None, None, None]
    }
    post_images_to_annot_service_mock.return_value = {
        35: url_dict,
        44: url_dict
    }

    db = DB(sm_config['db'])

    def throw_exception_function(*args):
        raise Exception('Test')

    try:
        ds_id = '2000-01-01_00h00m'
        upload_dt = datetime.now()
        ds_config_str = open(ds_config_path).read()
        db.insert(Dataset.DS_INSERT, [(ds_id, test_ds_name, input_dir_path, upload_dt.isoformat(' '),
                                       '{}', ds_config_str, DatasetStatus.QUEUED, True, ['HMDB-v4'])])

        with patch('sm.engine.search_job.ESExporter.index_ds') as index_ds_mock:
            index_ds_mock.side_effect = throw_exception_function

            job = SearchJob()
            ds = Dataset.load(db, ds_id)
            job.run(ds)
    except ESExportFailedError as e:
        assert e
        # dataset table asserts
        row = db.select_one("SELECT status from dataset")
        assert row[0] == 'FAILED'
    else:
        raise AssertionError('ESExportFailedError should be raised')
    finally:
        db.close()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))
