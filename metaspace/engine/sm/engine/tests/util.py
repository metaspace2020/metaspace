import json
from random import randint
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from pysparkling import Context
import pandas as pd
import uuid

from sm.engine.db import DB, ConnectionPool
from sm.engine.molecular_db import MolecularDB
from sm.engine.tests.db_sql_schema import DB_SQL_SCHEMA
from sm.engine.util import proj_root, SMConfig, init_loggers
from sm.engine.es_export import ESIndexManager

TEST_CONFIG_PATH = 'conf/test_config.json'
SMConfig.set_path(Path(proj_root()) / TEST_CONFIG_PATH)
sm_config = SMConfig.get_conf(update=True)
patch('sm.engine.util.SMConfig.get_conf', new_callable=lambda: lambda: sm_config).start()

init_loggers(sm_config['logs'])


@pytest.fixture()
def metadata():
    return {
        "Data_Type": "Imaging MS",
        "MS_Analysis": {
            "Polarity": "Positive",
            "Ionisation_Source": "MALDI",
            "Detector_Resolving_Power": {"Resolving_Power": 80000, "mz": 700},
            "Analyzer": "FTICR",
            "Pixel_Size": {"Xaxis": 100, "Yaxis": 100},
        },
    }


@pytest.fixture()
def ds_config():
    return {
        "image_generation": {"n_levels": 30, "ppm": 3, "min_px": 1},
        "analysis_version": 1,
        "isotope_generation": {
            "adducts": ["+H", "+Na", "+K", "[M]+"],
            "charge": 1,
            "isocalc_sigma": 0.000619,
            "instrument": "FTICR",
            "n_peaks": 4,
            "neutral_losses": [],
            "chem_mods": [],
        },
        "fdr": {"decoy_sample_size": 20},
        "databases": ["HMDB-v4"],
    }


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


@pytest.fixture()
def test_db(request):
    def autocommit_execute(db_config, *sqls):
        admin_conn = None
        try:
            admin_conn = psycopg2.connect(**db_config)
            admin_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            with admin_conn.cursor() as curs:
                for sql in sqls:
                    curs.execute(sql)
        finally:
            if admin_conn:
                admin_conn.close()

    db_name = f'sm_test_{hex(randint(0, 0xFFFFFFFF))[2:]}'
    sm_config['db']['database'] = db_name
    db_config_postgres = {**sm_config['db'], 'database': 'postgres'}
    autocommit_execute(
        db_config_postgres, f'DROP DATABASE IF EXISTS {db_name}', f'CREATE DATABASE {db_name}'
    )

    autocommit_execute(sm_config['db'], DB_SQL_SCHEMA)

    conn_pool = ConnectionPool(sm_config['db'])

    def fin():
        conn_pool.close()
        autocommit_execute(db_config_postgres, f'DROP DATABASE IF EXISTS {db_name}')

    request.addfinalizer(fin)


@pytest.fixture()
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB()
    db.insert(
        'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, '
        'status, status_update_dt, is_public) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
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
    db.insert(
        "INSERT INTO molecular_db (id, name, version) VALUES (%s, %s, %s)",
        rows=[(0, 'HMDB-v4', '2018-04-03')],
    )
    db.insert("INSERT INTO job (id, moldb_id, ds_id) VALUES (%s, %s, %s)", rows=[(0, 0, ds_id)])
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


@pytest.fixture()
def es():
    return Elasticsearch(
        hosts=[
            "{}:{}".format(sm_config['elasticsearch']['host'], sm_config['elasticsearch']['port'])
        ]
    )


@pytest.fixture()
def es_dsl_search():
    es = Elasticsearch(
        hosts=[
            "{}:{}".format(sm_config['elasticsearch']['host'], sm_config['elasticsearch']['port'])
        ]
    )
    return Search(using=es, index=sm_config['elasticsearch']['index'])


@pytest.fixture()
def sm_index(request):
    es_config = sm_config['elasticsearch']
    es_man = ESIndexManager(es_config)
    es_man.delete_index(es_config['index'])
    es_man.create_index(es_config['index'])

    def fin():
        es_man = ESIndexManager(es_config)
        es_man.delete_index(sm_config['elasticsearch']['index'])

    request.addfinalizer(fin)


def make_moldb_mock(formulas=('H2O', 'C5H3O')):
    moldb_mock = MagicMock(spec=MolecularDB)
    moldb_mock.id = 0
    moldb_mock.name = 'test_db'
    moldb_mock.formulas = list(formulas)
    return moldb_mock