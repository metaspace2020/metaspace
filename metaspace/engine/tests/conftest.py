from __future__ import annotations
import json
import logging
import os
from copy import deepcopy
from itertools import product
from pathlib import Path
import uuid
from unittest.mock import patch, DEFAULT

import numpy as np
import pytest
from elasticsearch import Elasticsearch
import psycopg2
from fasteners import InterProcessLock
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from pysparkling import Context

from sm.engine import image_storage
from sm.engine.db import DB, ConnectionPool
from sm.engine.tests.db_sql_schema import DB_SQL_SCHEMA
from sm.engine.util import populate_aws_env_vars
from sm.engine.config import proj_root, init_loggers, SMConfig
from sm.engine.es_export import ESIndexManager
from sm.engine.annotation.imzml_reader import FSImzMLReader
from sm.engine.storage import get_s3_client, create_bucket
from .utils import TEST_METADATA, TEST_DS_CONFIG, create_test_molecular_db

TEST_CONFIG_PATH = 'conf/test_config.json'
IMZML_BROWSER_BUCKET_NAME = 'sm-imzml-browser-test'


@pytest.fixture(scope='session')
def sm_config():
    SMConfig.set_path(Path(proj_root()) / TEST_CONFIG_PATH)
    SMConfig.get_conf(update=True)  # Force reload in case previous tests modified it
    worker_id = os.environ.get('PYTEST_XDIST_WORKER', 'gw0')

    test_id = f'sm_test_{worker_id}'
    # Update the internal cached copy of the config, so independent calls to SMConfig.get_conf()
    # also get the updated config
    SMConfig._config_dict['db']['database'] = test_id
    SMConfig._config_dict['rabbitmq']['prefix'] = f'test_{worker_id}__'

    for path in SMConfig._config_dict['lithops']['sm_storage'].values():
        # prefix keys with test ID so they can be cleaned up later
        path[1] = f'{test_id}/{path[1]}'

    # __LITHOPS_SESSION_ID determines the prefix to use for anonymous cloudobjects
    os.environ['__LITHOPS_SESSION_ID'] = f'{test_id}/cloudobjects'

    return SMConfig.get_conf()


@pytest.fixture(scope='session', autouse=True)
def global_setup(sm_config):
    init_loggers(sm_config['logs'])
    if 'aws' in sm_config:
        populate_aws_env_vars(sm_config['aws'])

    image_storage.init(sm_config)
    image_storage.configure_bucket(sm_config)

    s3_client = get_s3_client()
    create_bucket(IMZML_BROWSER_BUCKET_NAME, s3_client)


@pytest.fixture()
def metadata():
    return deepcopy(TEST_METADATA)


@pytest.fixture()
def ds_config():
    return deepcopy(TEST_DS_CONFIG)


@pytest.fixture(scope='module')
def pysparkling_context(request):
    return Context()


@pytest.fixture()
def spark_context(request):
    from pyspark import SparkContext
    import sys
    import os

    os.environ.setdefault('PYSPARK_PYTHON', sys.executable)

    # Prevent parallel tests from trying to launch more Spark contexts, as they get port conflicts
    with InterProcessLock('spark-context.lock'):
        with SparkContext(master='local[2]') as sc:
            yield sc


def _autocommit_execute(db_config, *sqls):
    conn = None
    try:
        conn = psycopg2.connect(**db_config)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        with conn.cursor() as curs:
            for sql in sqls:
                curs.execute(sql)
    except Exception as e:
        logging.getLogger('engine').error(e)
        raise
    finally:
        if conn:
            conn.close()


@pytest.fixture()
def empty_test_db(sm_config):
    db_name = sm_config['db']['database']
    db_owner = sm_config['db']['user']
    _autocommit_execute(
        {**sm_config['db'], 'database': 'postgres'},
        f'DROP DATABASE IF EXISTS {db_name}',
        f'CREATE DATABASE {db_name} OWNER {db_owner}',
    )

    conn_pool = ConnectionPool(sm_config['db'])

    yield

    conn_pool.close()
    _autocommit_execute(
        {**sm_config['db'], 'database': 'postgres'}, f'DROP DATABASE IF EXISTS {db_name}'
    )


@pytest.fixture()
def test_db(sm_config, empty_test_db):
    _autocommit_execute(sm_config['db'], DB_SQL_SCHEMA)


@pytest.fixture()
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB()
    db.insert(
        'INSERT INTO dataset ('
        '   id, name, input_path, upload_dt, metadata, config, status, status_update_dt, is_public'
        ') values (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
        rows=[
            (
                ds_id,
                'ds_name',
                'input_path',
                upload_dt,
                json.dumps(metadata),
                json.dumps(ds_config),
                'FINISHED',
                upload_dt,
                True,
            )
        ],
    )
    moldb = create_test_molecular_db()
    db.insert(
        "INSERT INTO job (id, moldb_id, ds_id) VALUES (%s, %s, %s)", rows=[(0, moldb.id, ds_id)]
    )
    db.insert(
        (
            "INSERT INTO annotation (job_id, formula, chem_mod, neutral_loss, adduct, "
            "msm, fdr, stats, iso_image_ids) VALUES (%s, %s, '', '', %s, 0.5, 0.2, '{}', %s)"
        ),
        rows=[
            (0, 'H2O', '+H', ['iso_image_11', 'iso_image_12']),
            (0, 'CH4', '+H', ['iso_image_21', 'iso_image_22']),
        ],
    )
    user_id = str(uuid.uuid4())
    db.insert(
        "INSERT INTO graphql.user (id, name, email) VALUES (%s, %s, %s)",
        rows=[(user_id, 'name', 'name@embl.de')],
    )
    group_id = str(uuid.uuid4())
    db.insert(
        "INSERT INTO graphql.group (id, name, short_name) VALUES (%s, %s, %s)",
        rows=[(group_id, 'group name', 'short name')],
    )
    db.insert(
        "INSERT INTO graphql.dataset (id, user_id, group_id) VALUES (%s, %s, %s)",
        rows=[('dataset id', user_id, group_id)],
    )

    return {"moldb": moldb}


@pytest.fixture()
def es(sm_config):
    hosts = [
        {
            "host": sm_config['elasticsearch']['host'],
            "port": int(sm_config['elasticsearch']['port']),
            'scheme': "http",
        }
    ]
    http_auth = (
        (sm_config['elasticsearch']['user'], sm_config['elasticsearch']['password'])
        if 'user' in sm_config['elasticsearch']
        else None
    )

    return Elasticsearch(hosts=hosts, basic_auth=http_auth)


@pytest.fixture()
def sm_index(sm_config, request):
    es_config = sm_config['elasticsearch']
    es_man = ESIndexManager(es_config)
    es_man.delete_index(es_config['dataset_index'])
    es_man.delete_index(es_config['annotation_index'])
    es_man.create_dataset_index(es_config['dataset_index'])
    es_man.create_annotation_index(es_config['annotation_index'])

    def fin():
        es_man = ESIndexManager(es_config)
        es_man.delete_index(sm_config['elasticsearch']['dataset_index'])
        es_man.delete_index(sm_config['elasticsearch']['annotation_index'])

    request.addfinalizer(fin)


@pytest.fixture()
def executor(sm_config):
    from sm.engine.annotation_lithops.executor import Executor

    executor = Executor(sm_config['lithops'], debug_run_locally=True)

    yield executor

    executor.clean()
    for bucket, prefix in sm_config['lithops']['sm_storage'].values():
        keys = executor.storage.list_keys(bucket, prefix)
        if keys:
            executor.storage.delete_objects(bucket, keys)


def make_imzml_reader_mock(
    coordinates=None,
    spectra=None,
    mz_precision='f',
    spectrum_metadata_fields=None,
) -> FSImzMLReader:
    if coordinates is None:
        coordinates = list(product(range(1, 11), range(1, 11), [1]))
    if spectra is None:
        spectra = (np.linspace(1, 100, 100), np.ones(100))
    if isinstance(spectra, tuple):
        spectra = [spectra] * len(coordinates)

    with patch('sm.engine.annotation.imzml_reader.find_file_by_ext') as find_file_mock:
        with patch('sm.engine.annotation.imzml_reader.ImzMLParser') as imzml_parser_mock:

            def add_spectra_metadata(*args, **kwargs):
                include_spectra_metadata = kwargs.get('include_spectra_metadata', [])
                assert include_spectra_metadata != 'full', 'not supported'
                for accession in include_spectra_metadata:
                    if accession not in imzml_parser_mock().spectrum_metadata_fields:
                        imzml_parser_mock().spectrum_metadata_fields[accession] = [None] * len(
                            coordinates
                        )
                return DEFAULT

            find_file_mock.return_value = 'test_dataset.imzml'
            imzml_parser_mock.side_effect = add_spectra_metadata
            imzml_parser_mock().coordinates = coordinates
            imzml_parser_mock().getspectrum.side_effect = lambda i: spectra[i]
            imzml_parser_mock().mzPrecision = mz_precision
            imzml_parser_mock().mzLengths = [len(mzs) for mzs, ints in spectra]
            imzml_parser_mock().intensityLengths = [len(ints) for mzs, ints in spectra]
            imzml_parser_mock().spectrum_metadata_fields = spectrum_metadata_fields or {}
            return FSImzMLReader(Path('mock_input_path'))
