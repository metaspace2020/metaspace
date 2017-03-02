from os.path import join
import pytest
from mock import patch
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
from fabric.api import local
from pyspark import SparkContext, SparkConf
from logging.config import dictConfig
from mock import MagicMock

from sm.engine.db import DB
from sm.engine.util import proj_root, sm_log_config, SMConfig
from sm.engine.es_export import ESExporter


log_config = sm_log_config
log_config['loggers']['sm-engine']['handlers'] = ['console_debug']
dictConfig(log_config)


@pytest.fixture(scope='module')
def spark_context(request):
    sc = SparkContext(master='local[2]', conf=SparkConf())

    def fin():
        sc.stop()
    request.addfinalizer(fin)

    return sc


@pytest.fixture()
def create_test_db():
    db_config = dict(database='postgres', user='sm', host='localhost')
    db = DB(db_config, autocommit=True)
    db.alter('DROP DATABASE IF EXISTS sm_test')
    db.alter('CREATE DATABASE sm_test')
    db.close()

    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_root(), 'scripts/create_schema.sql')))


@pytest.fixture()
def drop_test_db(request):
    def fin():
        db_config = dict(database='postgres', user='sm', host='localhost', password='1321')
        db = DB(db_config, autocommit=True)
        db.alter('DROP DATABASE IF EXISTS sm_test')
        db.close()
    request.addfinalizer(fin)


@pytest.fixture()
def ds_config():
    return {
        "database": {
            "name": "HMDB",
        },
        "isotope_generation": {
            "adducts": ["+H", "+Na"],
            "charge": {
                "polarity": "+",
                "n_charges": 1
            },
            "isocalc_sigma": 0.01,
            "isocalc_pts_per_mz": 10000
        },
        "image_generation": {
            "ppm": 1.0,
            "nlevels": 30,
            "q": 99,
            "do_preprocessing": False
        }
    }


@pytest.fixture()
def sm_config():
    return {
        "db": {
            "host": "localhost",
            "database": "sm_test",
            "user": "sm",
            "password": "1321"
        },
        "elasticsearch": {
            "index": "sm_test",
            "host": "localhost",
            "port": 9392
        },
        "rabbitmq": {
            "host": "localhost",
            "user": "sm",
            "password": "1321"
        },
        "services": {
            "iso_images": "http://localhost:3010/iso_images",
            "mol_db": "http://localhost:5000/v1"
        },
        "fs": {
            "base_path": "/opt/data/sm_test_data",
            "s3_base_path": ""
        },
        "spark": {
            "master": "local[*]",
            "executor.memory": "1g"
        }
    }


@pytest.fixture()
def es_dsl_search(sm_config):
    es = Elasticsearch(hosts=["{}:{}".format(sm_config['elasticsearch']['host'],
                                             sm_config['elasticsearch']['port'])])
    return Search(using=es, index=sm_config['elasticsearch']['index'])


@pytest.fixture()
def create_sm_index(sm_config):
    SMConfig._config_dict = sm_config
    with patch('sm.engine.es_export.DB') as DBMock:
        es_exp = ESExporter()
        es_exp.delete_index()
        es_exp.create_index()
