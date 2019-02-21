import json
import logging
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
from fabric.api import local
from pysparkling import Context
import pandas as pd
import uuid

from sm.engine.db import DB
from sm.engine.mol_db import MolecularDB
from sm.engine.tests.graphql_sql_schema import GRAPHQL_SQL_SCHEMA
from sm.engine.util import proj_root, SMConfig, init_loggers
from sm.engine.es_export import ESIndexManager

TEST_CONFIG_PATH = 'conf/test_config.json'
SMConfig.set_path(Path(proj_root()) / TEST_CONFIG_PATH)
sm_config = SMConfig.get_conf(update=True)

init_loggers(sm_config['logs'])


@pytest.fixture()
def metadata():
    return {
        "Data_Type": "Imaging MS",
        "MS_Analysis": {
            "Polarity": "Positive",
            "Ionisation_Source": "MALDI",
            "Detector_Resolving_Power": {
                "Resolving_Power": 80000,
                "mz": 700
            },
            "Analyzer": "FTICR"
        }
    }


@pytest.fixture()
def ds_config():
    return {
        "image_generation": {
            "q": 99,
            "do_preprocessing": False,
            "nlevels": 30,
            "ppm": 3
        },
        "isotope_generation": {
            "adducts": ["+H", "+Na", "+K"],
            "charge": {
                "polarity": "+",
                "n_charges": 1
            },
            "isocalc_sigma": 0.000619,
            "isocalc_pts_per_mz": 8078
        },
        "databases": ["HMDB-v4"]
    }


class SparkContext(Context):
    def parallelize(self, x, numSlices=None):
        return super().parallelize(x, numPartitions=numSlices)


@pytest.fixture(scope='module')
def pysparkling_context(request):
    return SparkContext()


@pytest.fixture(scope='module')
def pyspark_context(request):
    from pyspark import SparkContext
    import sys
    import os
    os.environ.setdefault('PYSPARK_PYTHON', sys.executable)
    sc = SparkContext(master='local[2]')
    request.addfinalizer(lambda: sc.stop())
    return sc


@pytest.fixture()
def test_db(request):
    db_config = dict(**sm_config['db'])
    db_config['database'] = 'postgres'

    db = DB(db_config, autocommit=True)
    db.alter('DROP DATABASE IF EXISTS sm_test')
    db.alter('CREATE DATABASE sm_test')
    db.close()

    local('psql -h {} -U {} sm_test < {}'.format(
        sm_config['db']['host'], sm_config['db']['user'],
        Path(proj_root()) / 'scripts/create_schema.sql'))

    db_config = dict(**sm_config['db'])
    db = DB(db_config, autocommit=True)
    db.alter(GRAPHQL_SQL_SCHEMA)
    db.close()

    def fin():
        DB.close_all()
        db = DB(db_config, autocommit=True)
        try:
            db.alter('DROP DATABASE IF EXISTS sm_test')
        except Exception as e:
            logging.getLogger('engine').warning('Drop sm_test database failed: %s', e)
        finally:
            db.close()
    request.addfinalizer(fin)


@pytest.fixture()
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB(sm_config['db'])
    db.insert('INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, '
              'status, is_public, mol_dbs, adducts) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(metadata), json.dumps(ds_config), 'FINISHED',
                     True, ['HMDB-v4'], ['+H'])])
    db.insert("INSERT INTO job (id, db_id, ds_id) VALUES (%s, %s, %s)",
              rows=[(0, 0, ds_id)])
    db.insert("INSERT INTO sum_formula (id, db_id, sf) VALUES (%s, %s, %s)",
              rows=[(1, 0, 'H2O')])
    db.insert(("INSERT INTO iso_image_metrics (job_id, db_id, sf, adduct, iso_image_ids) "
               "VALUES (%s, %s, %s, %s, %s)"),
              rows=[(0, 0, 'H2O', '+H', ['iso_image_1_id', 'iso_image_2_id'])])
    user_id = str(uuid.uuid4())
    db.insert("INSERT INTO graphql.user (id, name, email) VALUES (%s, %s, %s)",
              rows=[(user_id, 'name', 'name@embl.de')])
    group_id = str(uuid.uuid4())
    db.insert("INSERT INTO graphql.group (id, name, short_name) VALUES (%s, %s, %s)",
              rows=[(group_id, 'group name', 'short name')])
    db.insert("INSERT INTO graphql.dataset (id, user_id, group_id) VALUES (%s, %s, %s)",
              rows=[('dataset id', user_id, group_id)])
    db.close()


@pytest.fixture()
def es():
    return Elasticsearch(hosts=["{}:{}".format(sm_config['elasticsearch']['host'],
                                               sm_config['elasticsearch']['port'])])


@pytest.fixture()
def es_dsl_search():
    es = Elasticsearch(hosts=["{}:{}".format(sm_config['elasticsearch']['host'],
                                             sm_config['elasticsearch']['port'])])
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


@pytest.fixture()
def mol_db(ds_config):
    data = {'id': 1, 'name': 'HMDB', 'version': '2016'}
    service = MagicMock()
    db = MagicMock()
    service.find_db_by_id.return_value = data
    service.find_db_by_name_version.return_value = data
    SMConfig._config_dict = sm_config

    mol_db = MolecularDB(1, 'name', 'version', ds_config['isotope_generation'],
                         mol_db_service=service, db=db)
    mol_db._sf_df = pd.DataFrame(dict(
        sf_id=[1, 2, 3],
        adduct=['+H', '+Na', '+H'],
        mzs=[[100, 101, 102], [200], [150, 151]],
        centr_ints=[[1, 0.1, 0.05], [1], [1, 0.3]]
    ), columns=['sf_id', 'adduct', 'mzs', 'centr_ints'])
    return mol_db


def make_moldb_mock():
    moldb_mock = MagicMock(spec=MolecularDB)
    moldb_mock.id = 0
    moldb_mock.name = 'test_db'
    moldb_mock.formulas = ['H2O', 'C5H3O']
    return moldb_mock
