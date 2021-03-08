import json
import logging
from copy import deepcopy
from random import randint
from pathlib import Path
import uuid

import pytest
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from pysparkling import Context

from sm.engine import image_storage
from sm.engine.db import DB, ConnectionPool
from sm.engine.tests.db_sql_schema import DB_SQL_SCHEMA
from sm.engine.util import populate_aws_env_vars
from sm.engine.config import proj_root, init_loggers, SMConfig
from sm.engine.es_export import ESIndexManager
from .utils import TEST_METADATA, TEST_DS_CONFIG, create_test_molecular_db

TEST_CONFIG_PATH = 'conf/test_config.json'


@pytest.fixture(scope='session')
def sm_config():
    SMConfig.set_path(Path(proj_root()) / TEST_CONFIG_PATH)
    sm_config = SMConfig.get_conf()
    test_id = f'sm_test_{hex(randint(0, 0xFFFFFFFF))[2:]}'
    sm_config['db']['database'] = test_id
    for path in sm_config['lithops']['sm_storage'].values():
        # prefix keys with test ID so they can be cleaned up later
        path[1] = f'{test_id}/{path[1]}'

    return sm_config


@pytest.fixture(scope='session', autouse=True)
def global_setup(sm_config):
    init_loggers(sm_config['logs'])
    if 'aws' in sm_config:
        populate_aws_env_vars(sm_config['aws'])

    image_storage.init(sm_config['image_storage'])


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
    sc = SparkContext(master='local[2]')
    request.addfinalizer(lambda: sc.stop())
    return sc


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
    return Elasticsearch(
        hosts=[
            "{}:{}".format(sm_config['elasticsearch']['host'], sm_config['elasticsearch']['port'])
        ]
    )


@pytest.fixture()
def es_dsl_search(sm_config):
    es = Elasticsearch(
        hosts=[
            "{}:{}".format(sm_config['elasticsearch']['host'], sm_config['elasticsearch']['port'])
        ]
    )
    return Search(using=es, index=sm_config['elasticsearch']['index'])


@pytest.fixture()
def sm_index(sm_config, request):
    es_config = sm_config['elasticsearch']
    es_man = ESIndexManager(es_config)
    es_man.delete_index(es_config['index'])
    es_man.create_index(es_config['index'])

    def fin():
        es_man = ESIndexManager(es_config)
        es_man.delete_index(sm_config['elasticsearch']['index'])

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
