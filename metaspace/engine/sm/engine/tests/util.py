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
from sm.engine import ESExporter, ESIndexManager
from os.path import join


log_config = sm_log_config
log_config['loggers']['sm-engine']['handlers'] = ['console_debug']
dictConfig(log_config)


@pytest.fixture(scope='session')
def sm_config():
    SMConfig.set_path(join(proj_root(), 'conf', 'test_config.json'))
    return SMConfig.get_conf()


@pytest.fixture(scope='module')
def spark_context(request):
    sc = SparkContext(master='local[2]', conf=SparkConf())

    def fin():
        sc.stop()
    request.addfinalizer(fin)

    return sc


@pytest.fixture()
def test_db(sm_config, request):
    db_config = dict(**sm_config['db'])
    db_config['database'] = 'postgres'

    db = DB(db_config, autocommit=True)
    db.alter('DROP DATABASE IF EXISTS sm_test')
    db.alter('CREATE DATABASE sm_test')
    db.close()

    local('psql -h {} -U {} sm_test < {}'.format(
        sm_config['db']['host'], sm_config['db']['user'],
        join(proj_root(), 'scripts/create_schema.sql')))

    def fin():
        db = DB(db_config, autocommit=True)
        db.alter('DROP DATABASE IF EXISTS sm_test')
        db.close()
    request.addfinalizer(fin)


@pytest.fixture()
def ds_config():
    return {
        "databases": [{
            "name": "HMDB",
            "version": "2016"
        }],
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
def es_dsl_search(sm_config):
    es = Elasticsearch(hosts=["{}:{}".format(sm_config['elasticsearch']['host'],
                                             sm_config['elasticsearch']['port'])])
    return Search(using=es, index=sm_config['elasticsearch']['index'])


@pytest.fixture()
def sm_index(sm_config, request):
    es_config = sm_config['elasticsearch']
    with patch('sm.engine.es_export.DB') as DBMock:
        es_man = ESIndexManager(es_config)
        es_man.delete_index(es_config['index'])
        es_man.create_index(es_config['index'])

    def fin():
        es_man = ESIndexManager(es_config)
        es_man.delete_index(sm_config['elasticsearch']['index'])
    request.addfinalizer(fin)
