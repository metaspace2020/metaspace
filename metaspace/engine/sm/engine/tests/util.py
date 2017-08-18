from os.path import join
import pytest
from unittest.mock import patch
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
from fabric.api import local

#from pyspark import SparkContext, SparkConf
# lots of patch calls rely on SparkContext name
from pysparkling import Context as SparkContext

import pandas as pd
from logging.config import dictConfig
from unittest.mock import MagicMock

from sm.engine.db import DB
from sm.engine.mol_db import MolecularDB
from sm.engine.util import proj_root, sm_log_config, SMConfig
from sm.engine import ESExporter, ESIndexManager
from os.path import join


log_config = sm_log_config
log_config['loggers']['sm-engine']['handlers'] = ['console_debug']
dictConfig(log_config)


@pytest.fixture(scope='session')
def sm_config():
    SMConfig.set_path(join(proj_root(), 'conf', 'test_config.json'))
    return SMConfig.get_conf(update=True)


@pytest.fixture(scope='module')
def spark_context(request):
    return SparkContext()
    

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


@pytest.fixture()
def mol_db(sm_config, ds_config):
    data = {'id': 1, 'name': 'HMDB', 'version': '2016'}
    service = MagicMock()
    db = MagicMock()
    service.find_db_by_id.return_value = data
    service.find_db_by_name_version.return_value = data
    SMConfig._config_dict = sm_config

    mol_db = MolecularDB(1, None, None, ds_config['isotope_generation'],
                         mol_db_service=service, db=db)
    mol_db._sf_df = pd.DataFrame(dict(
        sf_id=[1, 2, 3],
        adduct=['+H', '+Na', '+H'],
        mzs=[[100, 101, 102], [200], [150, 151]],
        centr_ints=[[1, 0.1, 0.05], [1], [1, 0.3]]
    ), columns=['sf_id', 'adduct', 'mzs', 'centr_ints'])
    return mol_db
