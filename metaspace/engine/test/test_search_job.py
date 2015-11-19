from mock import patch
import pytest
import json
from collections import OrderedDict
from pyspark import SparkContext
from os.path import join, realpath
from fabric.api import local

from engine.search_job import SearchJob
from engine.db import DB


data_dir_path = realpath('../data/test_search_job')
proj_dir_path = realpath('..')


@pytest.fixture(scope='module')
def create_fill_sm_database(request):
    db_config = dict(database='postgres', user='sm', host='localhost', password='1321')
    db = DB(db_config, autocommit=True)
    db.alter('CREATE DATABASE sm_test')
    db.close()

    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.insert("INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)", [(0, 9, 'Au', ['04138'], ['Gold'])])
    db.insert("INSERT INTO theor_peaks VALUES (%s, %s, %s, %s, %s, %s, %s)",
              [(0, 9, '+H', [100, 200], [100, 10], [], [])])
    img_bounds_json = json.dumps({"y": {"max": 2, "min": 1}, "x": {"max": 2, "min": 0}})
    db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s)", [(0, 'test_ds', '/foo/path', img_bounds_json)])
    db.close()

    def fin():
        db_config = dict(database='postgres', user='sm', host='localhost', password='1321')
        db = DB(db_config, autocommit=True)
        db.alter('DROP DATABASE sm_test')
        db.close()
    request.addfinalizer(fin)


@pytest.fixture
def create_fill_work_dir(request):
    local('mkdir -p ../data/test_search_job')

    with open('../data/test_search_job/ds_coord.txt', 'w') as f:
        f.write((
            '0,0,0\n'
            '1,1,1\n'
            '2,0,1\n'
            '3,2,0\n'
            '4,2,1\n'))

    with open('../data/test_search_job/ds.txt', 'w') as f:
        f.write((
            '0|100|100\n'
            '1|101|0\n'
            '2|102|0\n'
            '3|103|0\n'
            '4|200|10\n'))

    def fin():
        pass

    request.addfinalizer(fin)


@pytest.fixture
def sm_config(request):
    return {
        "db": {
            'host': "localhost",
            'database': "sm_test",
            'user': "sm",
            'password': "1321"
        }
    }


@pytest.fixture
def ds_config(request):
    return {
        "name": "test_ds",
        "inputs": {
            "data_file": "test_ds.imzML",
            "database": "HMDB"
        },
        "isotope_generation": {
            "adducts": ["+H", "+Na", "+K"],
            "charge": {
                "polarity": "+",
                "n_charges": 1
            },
            "isocalc_sig": 0.01,
            "isocalc_resolution": 200000,
            "isocalc_do_centroid": True
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
        }
    }


def test_search_job(create_fill_sm_database, create_fill_work_dir, sm_config, ds_config):
    with patch('engine.search_job.SparkContext') as sc_mock:
        sc_mock.return_value = SparkContext(master='local[2]')

        job = SearchJob(join(data_dir_path, 'ds.txt'), join(data_dir_path, 'ds_coord.txt'), ds_config, sm_config)
        job.run()

        db = DB(sm_config['db'])
        row = db.select_one('SELECT job_id, db_id, sf_id, adduct, peaks_n, stats FROM iso_image_metrics')

        # image metrics asserts
        assert row
        assert tuple(row[:5]) == (0, 0, 9, '+H', 2)
        assert row[5] == OrderedDict(zip(['chaos', 'img_corr', 'pat_match'], (0., 0., 0.)))

        rows = db.select('SELECT job_id, db_id, sf_id, adduct, peak, intensities, min_int, max_int FROM iso_image')

        # image asserts
        assert rows
        assert len(rows) == 2

        assert tuple(rows[0][:5]) == (0, 0, 9, '+H', 0)
        assert rows[0][5] == [100., 0., 0., 0., 0., 0.]
        assert tuple(rows[0][6:8]) == (0, 100)

        assert tuple(rows[1][:5]) == (0, 0, 9, '+H', 1)
        assert rows[1][5] == [0., 0., 0., 0., 0., 10.]
        assert tuple(rows[1][6:8]) == (0, 10)

        db.close()
