import logging
import time
from functools import partial
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from sm.engine.annotation.job import JobStatus
from sm.engine.annotation.search_results import SearchResults
from sm.engine.daemons.actions import DaemonAction
from sm.engine.daemons.dataset_manager import DatasetManager
from sm.engine.daemons.lithops import LithopsDaemon
from sm.engine.daemons.update import SMUpdateDaemon
from sm.engine.dataset import DatasetStatus
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import (
    SM_DS_STATUS,
    SM_LITHOPS,
    SM_UPDATE,
    QueueConsumer,
    QueuePublisher,
)
from .utils import create_test_ds, create_test_molecular_db

logger = logging.getLogger('lithops-daemon')
test_ds_name = 'imzml_example_ds'


@pytest.fixture(scope='module')
def local_sm_config(sm_config):
    local_sm_config = sm_config
    local_sm_config['services']['colocalization'] = False
    local_sm_config['services']['ion_thumbnail'] = False
    local_sm_config['services']['off_sample'] = False
    return local_sm_config


@pytest.fixture()
def reset_queues(local_sm_config):
    # Delete queues to clean up remaining messages so they don't leak between tests
    for qdesc in [SM_LITHOPS, SM_UPDATE]:
        queue_pub = QueuePublisher(config=local_sm_config['rabbitmq'], qdesc=qdesc, logger=logger)
        queue_pub.delete_queue()


@pytest.fixture()
def queue_pub(local_sm_config):
    return QueuePublisher(config=local_sm_config['rabbitmq'], qdesc=SM_LITHOPS, logger=logger)


def init_moldb():
    db = DB()
    moldb = create_test_molecular_db()
    db.insert(
        "INSERT INTO molecule (mol_id, mol_name, formula, moldb_id) VALUES (%s, %s, %s, %s)",
        rows=[('HMDB0001', 'molecule name', 'C12H24O', moldb.id)],
    )
    return moldb


def make_formula_metrics_df():
    return pd.DataFrame(
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


IMAGE_IDS = ['iso_image_1', None, None, None]


def make_fake_annotate_lithops(db, moldb):
    """Stand-in for DatasetManager.annotate_lithops that performs the real result-storing
    steps (job row + SearchResults metrics insert), skipping only the Lithops pipeline itself."""

    def fake_annotate_lithops(ds, del_first=False, perform_enrichment=False):
        (job_id,) = db.insert_return(
            'INSERT INTO job (moldb_id, ds_id, status, start, finish) '
            'VALUES (%s, %s, %s, now(), now()) RETURNING id',
            rows=[(moldb.id, ds.id, JobStatus.FINISHED)],
        )
        search_results = SearchResults(ds_id=ds.id, job_id=job_id, n_peaks=4, charge=1)
        search_results.store_ion_metrics(
            make_formula_metrics_df(), {0: IMAGE_IDS, 1: IMAGE_IDS, 2: IMAGE_IDS}, db
        )

    return fake_annotate_lithops


def make_manager(db, es, sm_config):
    status_queue_pub = QueuePublisher(
        config=sm_config['rabbitmq'], qdesc=SM_DS_STATUS, logger=logger
    )
    return DatasetManager(
        db=db, es=es, status_queue=status_queue_pub, logger=logger, sm_config=sm_config
    )


def run_lithops_daemon(manager, wait_s=1.0):
    daemon = LithopsDaemon(manager, lit_qdesc=SM_LITHOPS, upd_qdesc=SM_UPDATE)
    daemon.start()
    time.sleep(wait_s)
    daemon.stop()


def run_update_daemon(manager, sm_config, wait_s=1.0):
    make_update_queue_cons = partial(
        QueueConsumer,
        config=sm_config['rabbitmq'],
        qdesc=SM_UPDATE,
        logger=logger,
        poll_interval=1,
    )
    update_daemon = SMUpdateDaemon(manager, make_update_queue_cons)
    update_daemon.start()
    time.sleep(wait_s)
    update_daemon.stop()


@patch.object(DatasetManager, 'annotate_lithops')
def test_lithops_daemon_success_flow(
    annotate_lithops_mock,
    # fixtures
    test_db,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    db = DB()
    es = ESExporter(db, local_sm_config)
    manager = make_manager(db, es, local_sm_config)

    ds = create_test_ds(name=test_ds_name, config=ds_config, status=DatasetStatus.QUEUED, es=es)
    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_lithops_daemon(manager)
    run_update_daemon(manager, local_sm_config)

    annotate_lithops_mock.assert_called_once()
    status = db.select_one('SELECT status FROM dataset WHERE id = %s', params=(ds.id,))[0]
    assert status == DatasetStatus.FINISHED


@patch.object(DatasetManager, 'annotate_lithops')
def test_lithops_daemon_stores_results_and_indexes(
    annotate_lithops_mock,
    # fixtures
    test_db,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    """Port of the old Spark test_sm_daemons success flow: the annotation pipeline itself is
    faked, but job/annotation storage (via the shared SearchResults) and ES indexing run for
    real, and their outputs are asserted."""
    moldb = init_moldb()
    db = DB()
    es = ESExporter(db, local_sm_config)
    manager = make_manager(db, es, local_sm_config)
    annotate_lithops_mock.side_effect = make_fake_annotate_lithops(db, moldb)

    ds = create_test_ds(
        name=test_ds_name,
        config={**ds_config, 'database_ids': [moldb.id]},
        status=DatasetStatus.QUEUED,
        es=es,
    )
    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_lithops_daemon(manager, wait_s=2.0)
    run_update_daemon(manager, local_sm_config)

    # dataset table asserts
    rows = db.select('SELECT id, status FROM dataset')
    assert rows == [(ds.id, DatasetStatus.FINISHED)]

    # job table asserts
    rows = db.select('SELECT moldb_id, ds_id, status FROM job')
    assert rows == [(moldb.id, ds.id, JobStatus.FINISHED)]

    # annotation metrics asserts
    rows = db.select('SELECT formula, adduct, msm, stats, iso_image_ids FROM annotation')
    # Sort in Python because postgres sorts symbols inconsistently between locales
    rows = sorted(rows, key=lambda row: row[1])
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
        assert iso_image_ids == IMAGE_IDS

    time.sleep(1)  # Waiting for ES
    # ES asserts
    es_config = local_sm_config['elasticsearch']
    ds_docs = es._es.search(index=es_config['dataset_index'])['hits']['hits']
    assert len(ds_docs) == 1
    ann_docs = es._es.search(index=es_config['annotation_index'])['hits']['hits']
    assert len(ann_docs) == 3
    for doc in ann_docs:
        assert doc['_id'].startswith(ds.id)


@patch.object(DatasetManager, 'annotate_lithops')
def test_lithops_daemon_es_export_fails(
    annotate_lithops_mock,
    # fixtures
    test_db,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    """Port of the old Spark test_sm_daemon_es_export_fails: annotation succeeds, but the ES
    export in the update daemon's INDEX step fails -> job stays FINISHED, dataset is FAILED."""
    moldb = init_moldb()
    db = DB()
    es = ESExporter(db, local_sm_config)
    manager = make_manager(db, es, local_sm_config)
    annotate_lithops_mock.side_effect = make_fake_annotate_lithops(db, moldb)

    def throw_exception_function(*args, **kwargs):
        raise Exception('Test')

    es.index_ds = throw_exception_function

    ds = create_test_ds(
        name=test_ds_name,
        config={**ds_config, 'database_ids': [moldb.id]},
        status=DatasetStatus.QUEUED,
        es=es,
    )
    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    run_lithops_daemon(manager, wait_s=2.0)
    run_update_daemon(manager, local_sm_config)

    row = db.select_one('SELECT status FROM job')
    assert row[0] == JobStatus.FINISHED
    row = db.select_one('SELECT status FROM dataset')
    assert row[0] == DatasetStatus.FAILED


@patch('sm.engine.daemons.lithops.os.kill')  # daemon suicides for supervisor restart; disarm it
@patch.object(DatasetManager, 'annotate_lithops', side_effect=Exception('Test exception'))
def test_lithops_daemon_failure_marks_ds_failed(
    annotate_lithops_mock,
    os_kill_mock,
    # fixtures
    test_db,
    reset_queues,
    metadata,
    ds_config,
    queue_pub,
    local_sm_config,
    sm_index,
):
    db = DB()
    es = ESExporter(db, local_sm_config)
    manager = make_manager(db, es, local_sm_config)

    ds = create_test_ds(name=test_ds_name, config=ds_config, status=DatasetStatus.QUEUED, es=es)
    queue_pub.publish({'ds_id': ds.id, 'ds_name': test_ds_name, 'action': DaemonAction.ANNOTATE})

    # The first pass fails and re-queues with retry_attempt=1; the second pass fails terminally.
    # Poll instead of a fixed sleep as the retry round-trips through RabbitMQ.
    daemon = LithopsDaemon(manager, lit_qdesc=SM_LITHOPS, upd_qdesc=SM_UPDATE)
    daemon.start()
    deadline = time.time() + 45
    status = None
    while time.time() < deadline:
        status = db.select_one('SELECT status FROM dataset WHERE id = %s', params=(ds.id,))[0]
        if status == DatasetStatus.FAILED:
            break
        time.sleep(0.5)
    daemon.stop()

    assert status == DatasetStatus.FAILED
    assert annotate_lithops_mock.call_count == 2
