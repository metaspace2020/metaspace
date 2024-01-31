import logging
import os
import sys
import time
from collections import OrderedDict
from functools import partial
from os.path import join, dirname
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from PIL import Image
from fabric.api import local
from fabric.context_managers import warn_only

from sm.engine.annotation.job import JobStatus
from sm.engine.daemons.actions import DaemonAction
from sm.engine.dataset import DatasetStatus
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueueConsumer
from .utils import create_test_molecular_db, create_test_ds, create_test_fdr_diagnostics_bundle

os.environ.setdefault('PYSPARK_PYTHON', sys.executable)
logger = logging.getLogger('annotate-daemon')
test_ds_name = 'imzml_example_ds'

input_dir_path = str(Path(__file__).parent.parent / 'tests/data/imzml_example_ds')


@pytest.fixture(scope='module')
def local_sm_config(sm_config):
    local_sm_config = sm_config
    local_sm_config['services']['colocalization'] = False
    return local_sm_config


@pytest.fixture()
def clean_isotope_storage(local_sm_config):
    with warn_only():
        local('rm -rf {}'.format(local_sm_config['isotope_storage']['path']))


@pytest.fixture()
def reset_queues(local_sm_config):
    from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_UPDATE

    # Delete queues to clean up remaining messages so that they don't interfere with other tests
    for qdesc in [SM_ANNOTATE, SM_UPDATE]:
        queue_pub = QueuePublisher(config=local_sm_config['rabbitmq'], qdesc=qdesc, logger=logger)
        queue_pub.delete_queue()


def init_moldb():
    db = DB()
    moldb = create_test_molecular_db()
    db.insert(
        "INSERT INTO molecule (mol_id, mol_name, formula, moldb_id) VALUES (%s, %s, %s, %s)",
        rows=[('HMDB0001', 'molecule name', 'C12H24O', moldb.id)],
    )
    return moldb


get_ion_images_for_analysis_mock_return = (
    np.linspace(0, 25, 18).reshape((3, 6)),
    np.linspace(0, 1, 6).reshape((2, 3)),
    (2, 3),
)


@pytest.fixture()
def queue_pub(local_sm_config):
    from sm.engine import queue

    qname = 'annotate'
    # Queue names are given a per-test-worker prefix in the sm_config fixture
    if qname == 'annotate':
        qdesc = queue.SM_ANNOTATE
    elif qname == 'update':
        qdesc = queue.SM_UPDATE
    else:
        raise Exception(f'Wrong qname={qname}')
    return queue.QueuePublisher(config=local_sm_config['rabbitmq'], qdesc=qdesc, logger=logger)


def run_daemons(db, es, sm_config):
    from sm.engine.queue import QueuePublisher, SM_DS_STATUS, SM_ANNOTATE, SM_UPDATE
    from sm.engine.daemons.dataset_manager import DatasetManager
    from sm.engine.daemons.annotate import SMAnnotateDaemon
    from sm.engine.daemons.update import SMUpdateDaemon

    status_queue_pub = QueuePublisher(
        config=sm_config['rabbitmq'], qdesc=SM_DS_STATUS, logger=logger
    )

    manager = DatasetManager(
        db=db,
        es=es,
        status_queue=status_queue_pub,
        logger=logger,
        sm_config=sm_config,
    )
    annotate_daemon = SMAnnotateDaemon(
        manager=manager, annot_qdesc=SM_ANNOTATE, upd_qdesc=SM_UPDATE
    )
    annotate_daemon.start()
    time.sleep(0.1)
    annotate_daemon.stop()
    make_update_queue_cons = partial(
        QueueConsumer, config=sm_config['rabbitmq'], qdesc=SM_UPDATE, logger=logger, poll_interval=1
    )
    update_daemon = SMUpdateDaemon(manager, make_update_queue_cons)
    update_daemon.start()
    time.sleep(0.1)
    update_daemon.stop()


@patch(
    'sm.engine.image_storage.get_ion_images_for_analysis',
    return_value=get_ion_images_for_analysis_mock_return,
)
@patch(
    'sm.engine.image_storage.get_image',
    return_value=Image.new('RGBA', (10, 10)),
)
@patch('sm.engine.annotation_spark.search_results.SearchResults._post_images_to_image_store')
@patch(
    'sm.engine.postprocessing.off_sample_wrapper.call_api',
    return_value={'predictions': {'label': 'off', 'prob': 0.99}},
)
@patch('sm.engine.annotation_spark.annotation_job.MSMSearch')
def test_sm_daemons(
    MSMSearchMock,
    call_off_sample_api_mock,
    post_images_to_image_store_mock,
    get_image_mock,
    get_ion_images_for_analysis_mock,
    # fixtures
    test_db,
    clean_isotope_storage,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_config,
    sm_index,
):
    moldb = init_moldb()
    dataset_index = sm_config['elasticsearch']['dataset_index']
    annotation_index = sm_config['elasticsearch']['annotation_index']

    formula_metrics_df = pd.DataFrame(
        {
            'formula_i': [0, 1, 2],
            'ion_formula': ['C12H24O-H2O+H', 'C12H24O-H2+O2-CO+Na', 'C12H24O'],
            'formula': ['C12H24O', 'C12H24O', 'C12H24O'],
            'modifier': ['-H2O+H', '-H2+O2-CO+Na', ''],
            'chem_mod': ['', '-H2+O2', ''],
            'neutral_loss': ['-H2O', '-CO', ''],
            'adduct': ['+H', '+Na', '[M]+'],
            'chaos': [0.9, 0.9, 0.9],
            'spatial': [0.9, 0.9, 0.9],
            'spectral': [0.9, 0.9, 0.9],
            'msm': [0.9 ** 3, 0.9 ** 3, 0.9 ** 3],
            'total_iso_ints': [[100.0], [100.0], [100.0]],
            'min_iso_ints': [[0], [0], [0]],
            'max_iso_ints': [[10.0], [10.0], [10.0]],
            'fdr': [0.1, 0.1, 0.1],
        }
    ).set_index('formula_i')
    search_algo_mock = MSMSearchMock()

    def mock_search(*args):
        # Read all spectra so that ImzML diagnostic fields are populated
        imzml_reader = MSMSearchMock.call_args_list[-1][1]['imzml_reader']
        _ = list(imzml_reader.iter_spectra(range(imzml_reader.n_spectra)))
        return [(formula_metrics_df, [], create_test_fdr_diagnostics_bundle())]

    search_algo_mock.search.side_effect = mock_search
    search_algo_mock.metrics = OrderedDict(
        [
            ('chaos', 0),
            ('spatial', 0),
            ('spectral', 0),
            ('msm', 0),
            ('total_iso_ints', []),
            ('min_iso_ints', []),
            ('max_iso_ints', []),
        ]
    )

    image_ids = ['iso_image_1', None, None, None]
    post_images_to_image_store_mock.return_value = {0: image_ids, 1: image_ids, 2: image_ids}

    db = DB()
    es = ESExporter(db, local_sm_config)

    ds = create_test_ds(
        name=test_ds_name,
        input_path=input_dir_path,
        config={**ds_config, 'database_ids': [moldb.id]},
        status=DatasetStatus.QUEUED,
        es=es,
    )

    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_daemons(db, es, local_sm_config)

    # dataset table asserts
    rows = db.select('SELECT id, name, input_path, upload_dt, status from dataset')
    input_path = join(dirname(__file__), 'data', test_ds_name)
    assert len(rows) == 1
    assert rows[0] == (ds.id, test_ds_name, input_path, ds.upload_dt, DatasetStatus.FINISHED)

    # ms acquisition geometry asserts
    rows = db.select('SELECT acq_geometry from dataset')
    assert len(rows) == 1
    assert rows[0][0] == ds.get_acq_geometry(db)
    assert rows[0][0] == {
        'length_unit': 'nm',
        'acquisition_grid': {'regular_grid': True, 'count_x': 3, 'count_y': 3},
        'pixel_size': {'regular_size': True, 'size_x': 100, 'size_y': 100},
    }

    # job table asserts
    rows = db.select('SELECT moldb_id, ds_id, status, start, finish from job')
    assert len(rows) == 1
    moldb_id, ds_id, status, start, finish = rows[0]
    assert (moldb_id, ds_id, status) == (moldb.id, ds.id, JobStatus.FINISHED)
    assert start <= finish

    # image metrics asserts
    rows = db.select('SELECT formula, adduct, msm, stats, iso_image_ids FROM annotation')
    rows = sorted(
        rows, key=lambda row: row[1]
    )  # Sort in Python because postgres sorts symbols inconsistently between locales
    assert len(rows) == 3
    for row, expected_adduct in zip(rows, ['+H', '+Na', '[M]+']):
        formula, adduct, msm, stats, iso_image_ids = row
        assert formula == 'C12H24O'
        assert adduct == expected_adduct
        assert np.isclose(msm, 0.9 ** 3)
        assert stats == {
            'chaos': 0.9,
            'spatial': 0.9,
            'spectral': 0.9,
            'total_iso_ints': [100.0],
            'min_iso_ints': [0],
            'max_iso_ints': [10.0],
        }
        assert iso_image_ids == ['iso_image_1', None, None, None]

    time.sleep(1)  # Waiting for ES
    # ES asserts
    ds_docs = es._es.search(index=dataset_index)['hits']['hits']
    assert 1 == len(ds_docs)
    ann_docs = es._es.search(index=annotation_index)['hits']['hits']
    assert len(ann_docs) == len(rows)
    for doc in ann_docs:
        assert doc['_id'].startswith(ds_id)


@patch('sm.engine.annotation_spark.search_results.SearchResults._post_images_to_image_store')
@patch('sm.engine.annotation_spark.annotation_job.MSMSearch')
def test_sm_daemons_annot_fails(
    MSMSearchMock,
    post_images_to_image_store_mock,
    test_db,
    clean_isotope_storage,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    moldb = init_moldb()

    def throw_exception_function(*args, **kwargs):
        raise Exception('Test exception')

    msm_algo_mock = MSMSearchMock()
    msm_algo_mock.search.side_effect = throw_exception_function

    image_ids = ['iso_image_1', None, None, None]
    post_images_to_image_store_mock.return_value = {0: image_ids, 1: image_ids, 2: image_ids}

    db = DB()
    es = ESExporter(db, local_sm_config)
    ds = create_test_ds(
        name=test_ds_name,
        input_path=input_dir_path,
        config={**ds_config, 'database_ids': [moldb.id]},
        status=DatasetStatus.QUEUED,
        es=es,
    )

    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_daemons(db, es, local_sm_config)

    # dataset and job tables asserts
    row = db.select_one('SELECT status from dataset')
    assert len(row) == 1
    assert row[0] == 'FAILED'


@patch('sm.engine.annotation_spark.search_results.SearchResults._post_images_to_image_store')
@patch('sm.engine.annotation_spark.annotation_job.MSMSearch')
def test_sm_daemon_es_export_fails(
    MSMSearchMock,
    post_images_to_image_store_mock,
    test_db,
    clean_isotope_storage,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    moldb = init_moldb()

    formula_metrics_df = pd.DataFrame(
        {
            'formula_i': [0, 1, 2],
            'ion_formula': ['C12H24O-H2O+H', 'C12H24O-H2+O2-CO+Na', 'C12H24O+K'],
            'formula': ['C12H24O', 'C12H24O', 'C12H24O'],
            'modifier': ['-H2O+H', '-H2+O2-CO+Na', '+K'],
            'chem_mod': ['', '-H2+O2', ''],
            'neutral_loss': ['-H2O', '-CO', ''],
            'adduct': ['+H', '+Na', '+K'],
            'chaos': [0.9, 0.9, 0.9],
            'spatial': [0.9, 0.9, 0.9],
            'spectral': [0.9, 0.9, 0.9],
            'msm': [0.9 ** 3, 0.9 ** 3, 0.9 ** 3],
            'total_iso_ints': [[100.0], [100.0], [100.0]],
            'min_iso_ints': [[0], [0], [0]],
            'max_iso_ints': [[10.0], [10.0], [10.0]],
            'fdr': [0.1, 0.1, 0.1],
        }
    ).set_index('formula_i')
    search_algo_mock = MSMSearchMock()
    search_algo_mock.search.return_value = [
        (formula_metrics_df, [], create_test_fdr_diagnostics_bundle())
    ]
    search_algo_mock.metrics = OrderedDict(
        [
            ('chaos', 0),
            ('spatial', 0),
            ('spectral', 0),
            ('msm', 0),
            ('total_iso_ints', []),
            ('min_iso_ints', []),
            ('max_iso_ints', []),
        ]
    )
    image_ids = ['iso_image_1', None, None, None]
    post_images_to_image_store_mock.return_value = {0: image_ids, 1: image_ids, 2: image_ids}

    db = DB()

    def throw_exception_function(*args, **kwargs):
        raise Exception('Test')

    es = ESExporter(db, local_sm_config)
    es.index_ds = throw_exception_function

    ds = create_test_ds(
        name=test_ds_name,
        input_path=input_dir_path,
        config={**ds_config, 'database_ids': [moldb.id]},
        status=DatasetStatus.QUEUED,
        es=es,
    )

    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_daemons(db, es, local_sm_config)

    # dataset and job tables asserts
    row = db.select_one('SELECT status from job')
    assert row[0] == 'FINISHED'
    row = db.select_one('SELECT status from dataset')
    assert row[0] == 'FAILED'
