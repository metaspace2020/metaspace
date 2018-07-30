import os
import sys
import logging
from os.path import join, dirname
from unittest.mock import patch
import time
from datetime import datetime

import pytest
from fabric.api import local
from fabric.context_managers import warn_only

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.acq_geometry_factory import ACQ_GEOMETRY_KEYS
from sm.engine.search_job import JobStatus
from sm.engine.tests.util import sm_config, ds_config, test_db, init_loggers, sm_index, es_dsl_search


os.environ.setdefault('PYSPARK_PYTHON', sys.executable)

init_loggers(sm_config()['logs'])
logger = logging.getLogger('annotate-daemon')

test_ds_name = 'imzml_example_ds'

proj_dir_path = dirname(dirname(__file__))
data_dir_path = join(sm_config()["fs"]["base_path"], test_ds_name)
input_dir_path = join(proj_dir_path, 'tests/data/imzml_example_ds')
ds_config_path = join(input_dir_path, 'config.json')


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


def init_queue_pub(qname='annotate'):
    from sm.engine import queue
    queue.SM_ANNOTATE['name'] = queue.SM_ANNOTATE['name'] + '_test'
    queue.SM_UPDATE['name'] = queue.SM_UPDATE['name'] + '_test'
    if qname == 'annotate':
        qdesc = queue.SM_ANNOTATE
    elif qname == 'update':
        qdesc = queue.SM_UPDATE
    else:
        raise Exception(f'Wrong qname={qname}')
    queue_pub = queue.QueuePublisher(config=sm_config()['rabbitmq'],
                                     qdesc=qdesc,
                                     logger=logger)
    return queue_pub


queue_pub = init_queue_pub()


def run_daemons(db, es):
    from sm.engine.queue import QueuePublisher, SM_DS_STATUS, SM_ANNOTATE, SM_UPDATE
    from sm.engine.png_generator import ImageStoreServiceWrapper
    from sm.engine.sm_daemons import SMDaemonManager, SMAnnotateDaemon, SMUpdateDaemon

    status_queue_pub = QueuePublisher(config=sm_config()['rabbitmq'],
                                      qdesc=SM_DS_STATUS,
                                      logger=logger)
    manager = SMDaemonManager(
        db=db, es=es,
        img_store=ImageStoreServiceWrapper(sm_config()['services']['img_service_url']),
        status_queue=status_queue_pub,
        logger=logger,
        sm_config=sm_config()
    )
    annotate_daemon = SMAnnotateDaemon(manager=manager,
                                       annot_qdesc=SM_ANNOTATE,
                                       upd_qdesc=SM_UPDATE)
    annotate_daemon.start()
    annotate_daemon.stop()
    update_daemon = SMUpdateDaemon(manager=manager,
                                   update_qdesc=SM_UPDATE)
    update_daemon.start()
    update_daemon.stop()


@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_sm_daemons(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                    post_images_to_annot_service_mock,
                    MolDBServiceWrapperMock,
                    sm_config, test_db, es_dsl_search, clean_isotope_storage):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)

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
    es = ESExporter(db)
    annotate_daemon = None
    update_daemon = None

    try:
        ds_config_str = open(ds_config_path).read()
        upload_dt = datetime.now()
        ds_id = '2000-01-01_00h00m'
        db.insert(Dataset.DS_INSERT, [{
            'id': ds_id,
            'name': test_ds_name,
            'input_path': input_dir_path,
            'upload_dt': upload_dt,
            'metadata': '{"Data_Type": "Imaging MS"}',
            'config': ds_config_str,
            'status': DatasetStatus.QUEUED,
            'is_public': True,
            'mol_dbs': ['HMDB-v4'],
            'adducts': ['+H', '+Na', '+K'],
            'ion_img_storage': 'fs'
        }])

        ds = Dataset.load(db, ds_id)
        queue_pub.publish({'ds_id': ds.id, 'ds_name': ds.name, 'action': 'annotate'})

        run_daemons(db, es)

        # dataset table asserts
        rows = db.select('SELECT id, name, input_path, upload_dt, status from dataset')
        input_path = join(dirname(__file__), 'data', test_ds_name)
        assert len(rows) == 1
        assert rows[0] == (ds_id, test_ds_name, input_path, upload_dt, DatasetStatus.FINISHED)

        # ms acquisition geometry asserts
        rows = db.select('SELECT acq_geometry from dataset')
        assert len(rows) == 1
        assert rows[0][0] == ds.get_acq_geometry(db)
        assert rows[0][0] == {
            ACQ_GEOMETRY_KEYS.LENGTH_UNIT: 'nm',
            ACQ_GEOMETRY_KEYS.AcqGridSection.section_name: {
                ACQ_GEOMETRY_KEYS.AcqGridSection.REGULAR_GRID: True,
                ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_X : 3,
                ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_COUNT_Y : 3,
                ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_X : 100,
                ACQ_GEOMETRY_KEYS.AcqGridSection.PIXEL_SPACING_Y : 100
            },
            ACQ_GEOMETRY_KEYS.PixelSizeSection.section_name: {
                ACQ_GEOMETRY_KEYS.PixelSizeSection.REGULAR_SIZE: True,
                ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_X : 100,
                ACQ_GEOMETRY_KEYS.PixelSizeSection.PIXEL_SIZE_Y : 100
            }
        }

        # job table asserts
        rows = db.select('SELECT db_id, ds_id, status, start, finish from job')
        assert len(rows) == 1
        db_id, ds_id, status, start, finish = rows[0]
        assert (db_id, ds_id, status) == (0, '2000-01-01_00h00m', JobStatus.FINISHED)
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
        if annotate_daemon:
            annotate_daemon.stop()
        if update_daemon:
            update_daemon.stop()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))


@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_sm_daemons_annot_fails(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                post_images_to_annot_service_mock,
                                MolDBServiceWrapperMock,
                                sm_config, test_db, es_dsl_search,
                                clean_isotope_storage):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)

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
    es = ESExporter(db)
    annotate_daemon = None

    try:
        ds_id = '2000-01-01_00h00m'
        upload_dt = datetime.now()
        ds_config_str = open(ds_config_path).read()
        db.insert(Dataset.DS_INSERT, [{
            'id': ds_id,
            'name': test_ds_name,
            'input_path': input_dir_path,
            'upload_dt': upload_dt,
            'metadata': '{}',
            'config': ds_config_str,
            'status': DatasetStatus.QUEUED,
            'is_public': True,
            'mol_dbs': ['HMDB-v4'],
            'adducts': ['+H', '+Na', '+K'],
            'ion_img_storage': 'fs'
        }])

        ds = Dataset.load(db, ds_id)
        queue_pub.publish({'ds_id': ds.id, 'ds_name': ds.name, 'action': 'annotate'})

        run_daemons(db, es)

        # dataset and job tables asserts
        row = db.select_one('SELECT status from dataset')
        assert row[0] == 'FAILED'
        row = db.select_one('SELECT status from job')
        assert row[0] == 'FAILED'
    finally:
        db.close()
        if annotate_daemon:
            annotate_daemon.stop()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))


@patch('sm.engine.mol_db.MolDBServiceWrapper')
@patch('sm.engine.search_results.SearchResults.post_images_to_image_store')
@patch('sm.engine.msm_basic.msm_basic_search.MSMBasicSearch.filter_sf_metrics')
@patch('sm.engine.msm_basic.formula_img_validator.get_compute_img_metrics')
def test_sm_daemon_es_export_fails(get_compute_img_metrics_mock, filter_sf_metrics_mock,
                                   post_images_to_annot_service_mock,
                                   MolDBServiceWrapperMock,
                                   sm_config, test_db, es_dsl_search,
                                   clean_isotope_storage):
    init_mol_db_service_wrapper_mock(MolDBServiceWrapperMock)

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
    annotate_daemon = None
    update_daemon = None

    def throw_exception_function(*args, **kwargs):
        raise Exception('Test')

    es = ESExporter(db)
    es.index_ds = throw_exception_function

    try:
        ds_id = '2000-01-01_00h00m'
        upload_dt = datetime.now()
        ds_config_str = open(ds_config_path).read()
        db.insert(Dataset.DS_INSERT, [{
            'id': ds_id,
            'name': test_ds_name,
            'input_path': input_dir_path,
            'upload_dt': upload_dt,
            'metadata': '{}',
            'config': ds_config_str,
            'status': DatasetStatus.QUEUED,
            'is_public': True,
            'mol_dbs': ['HMDB-v4'],
            'adducts': ['+H', '+Na', '+K'],
            'ion_img_storage': 'fs'
        }])

        ds = Dataset.load(db, ds_id)
        queue_pub.publish({'ds_id': ds.id, 'ds_name': ds.name, 'action': 'annotate'})

        run_daemons(db, es)

        # dataset and job tables asserts
        row = db.select_one('SELECT status from job')
        assert row[0] == 'FINISHED'
        row = db.select_one('SELECT status from dataset')
        assert row[0] == 'FAILED'
    finally:
        db.close()
        if annotate_daemon:
            annotate_daemon.stop()
        if update_daemon:
            update_daemon.stop()
        with warn_only():
            local('rm -rf {}'.format(data_dir_path))
