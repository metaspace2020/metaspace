import pytest
from pyspark import SparkContext, SparkConf
from fabric.api import local
from os.path import join, realpath, dirname
import os

from engine.db import DB


@pytest.fixture(scope='module')
def spark_context(request):
    sc = SparkContext(master='local[2]', conf=SparkConf())

    def fin():
        sc.stop()
    request.addfinalizer(fin)

    return sc


@pytest.fixture()
def create_test_db():
    db_config = dict(database='postgres', user='postgres', host='localhost')
    db = DB(db_config, autocommit=True)
    db.alter('DROP DATABASE IF EXISTS sm_test')
    db.alter('CREATE DATABASE sm_test')
    db.close()

    proj_dir_path = dirname(dirname(dirname(__file__)))
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))


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
        "inputs": {
            "data_file": "test_ds.imzML",
            "database": "HMDB"
        },
        "isotope_generation": {
            "adducts": ["+H", "+Na"],
            "charge": {
                "polarity": "+",
                "n_charges": 1
            },
            "isocalc_sigma": 0.01,
            "isocalc_points_per_mz": 10000
        },
        "image_generation": {
            "ppm": 1.0,
            "nlevels": 30,
            "q": 99,
            "do_preprocessing": False
        },
        "image_measure_thresholds": {
            "measure_of_chaos": -1.0,
            "image_corr": -1.0,
            "pattern_match": -1.0
        },
        "molecules_num": 3
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
        "fs": {
            "data_dir": "/opt/data/sm_test_data",
            "local": True
        },
        "hdfs": {
            "namenode": "localhost"
        },
        "spark": {
            "master": "local[2]",
            "executor.memory": "1g"
        }
    }