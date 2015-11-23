from mock import patch, MagicMock
import pytest
import json
import numpy as np
from collections import OrderedDict
from pyspark import SparkContext
from os.path import join, realpath
from fabric.api import local

from engine.search_job import SearchJob
from engine.db import DB
from engine.pyMS.mass_spectrum import MassSpectrum
from engine.test.util import sm_config, ds_config, create_test_db, drop_test_db


data_dir_path = realpath('../data/test_search_job')
proj_dir_path = realpath('..')


@pytest.fixture(scope='module')
def create_fill_sm_database(create_test_db, drop_test_db):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.insert("INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)", [(0, 9, 'Au', ['04138'], ['Gold'])])
    img_bounds_json = json.dumps({"y": {"max": 2, "min": 1}, "x": {"max": 2, "min": 0}})
    db.insert("INSERT INTO dataset VALUES (%s, %s, %s, %s)", [(0, 'test_ds', '/foo/path', img_bounds_json)])
    db.close()


@pytest.fixture
def create_fill_work_dir(request):
    local('mkdir -p ../data/test_ds')

    with open('../data/test_ds/ds_coord.txt', 'w') as f:
        f.write((
            '0,0,0\n'
            '1,1,1\n'
            '2,0,1\n'
            '3,2,0\n'
            '4,2,1\n'))

    with open('../data/test_ds/ds.txt', 'w') as f:
        f.write((
            '0|197.973847|100\n'
            '1|197.973847|0\n'
            '2|197.973847|0\n'
            '3|197.973847|0\n'
            '4|198.98012|10\n'))

    # def fin():
    #     local('rm -r ../data/test_search_job')
    #
    # request.addfinalizer(fin)


def test_search_job(create_fill_sm_database, create_fill_work_dir, sm_config, ds_config):
    with patch('engine.search_job.SparkContext') as sc_mock:
        sc_mock.return_value = SparkContext(master='local[2]')

        job = SearchJob('', ds_config, sm_config)
        job.run()

        # theoretical patterns asserts
        db = DB(sm_config['db'])
        rows = db.select('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints FROM theor_peaks')

        assert len(rows) == 2
        assert rows[0][:5] == (0, 9, '+H', [197.973847, 198.98012], [100.0, 0.011501])
        assert rows[1][:5] == (0, 9, '+Na', [219.95579], [100.0])

        # image metrics asserts
        rows = db.select('SELECT job_id, db_id, sf_id, adduct, peaks_n, stats FROM iso_image_metrics')

        assert len(rows) == 1
        assert rows[0]
        assert tuple(rows[0][:5]) == (0, 0, 9, '+H', 2)
        assert set(rows[0][5].keys()) == {'chaos', 'img_corr', 'pat_match'}

        # image asserts
        rows = db.select('SELECT job_id, db_id, sf_id, adduct, peak, intensities, min_int, max_int FROM iso_image')

        assert rows
        assert len(rows) == 2

        assert tuple(rows[0][:5]) == (0, 0, 9, '+H', 0)
        assert rows[0][5] == [100., 0., 0., 0., 0., 0.]
        assert tuple(rows[0][6:8]) == (0, 100)

        assert tuple(rows[1][:5]) == (0, 0, 9, '+H', 1)
        assert rows[1][5] == [0., 0., 0., 0., 0., 10.]
        assert tuple(rows[1][6:8]) == (0, 10)

        db.close()
