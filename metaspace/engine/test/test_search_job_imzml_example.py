from mock import patch, MagicMock
import pytest
import json
import numpy as np
from pyspark import SparkContext
from os.path import join, realpath, dirname
from fabric.api import local
from fabric.context_managers import warn_only

from engine.search_job import SearchJob
from engine.db import DB
from engine.test.util import sm_config, ds_config, create_test_db, drop_test_db


test_ds_name = 'imzml_example_ds'

proj_dir_path = dirname(dirname(__file__))
data_dir_path = join(sm_config()["fs"]["data_dir"], test_ds_name)
test_dir_path = join(proj_dir_path, 'test/data/imzml_example_ds')


@pytest.fixture()
def create_fill_sm_database(create_test_db, drop_test_db, sm_config):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db = DB(sm_config['db'])
    db.insert("INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)",
              [(0, 10007, 'C12H24O', ['00001'], ['compound_name'])])
    db.close()


def test_search_job_imzml_example(create_fill_sm_database, sm_config):
    with open(join(test_dir_path, 'config.json')) as ds_config_file:
        ds_config = json.load(ds_config_file)

    with patch('engine.search_job.SparkContext') as sc:
        sc.return_value = SparkContext(master='local[2]')

        db = DB(sm_config['db'])
        try:
            job = SearchJob(ds_config, sm_config)
            job.run(test_dir_path)

            # dataset meta asserts
            rows = db.select("SELECT id, name, file_path, img_bounds from dataset")
            img_bounds = {u'y': {u'max': 3, u'min': 1}, u'x': {u'max': 3, u'min': 1}}
            file_path = join(data_dir_path, 'Example_Continuous.imzML')
            assert len(rows) == 1
            assert rows[0] == (0, test_ds_name, file_path, img_bounds)

            # theoretical patterns asserts
            db = DB(sm_config['db'])
            rows = db.select('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints '
                             'FROM theor_peaks '
                             'ORDER BY adduct')

            assert len(rows) == 3
            assert rows[0][:3] == (0, 10007, '+H')
            assert rows[1][:3] == (0, 10007, '+K')
            assert rows[2][:3] == (0, 10007, '+Na')
            for r in rows:
                assert r[3] and r[4] and r[5] and r[6]

            # image metrics asserts
            rows = db.select(('SELECT job_id, db_id, sf_id, adduct, peaks_n, stats FROM iso_image_metrics '
                              'ORDER BY sf_id, adduct'))

            assert rows
            assert rows[0]
            assert tuple(rows[0][:3]) == (0, 0, 10007)
            assert set(rows[0][5].keys()) == {'chaos', 'img_corr', 'pat_match'}

            # image asserts
            rows = db.select(('SELECT job_id, db_id, sf_id, adduct, peak, intensities, min_int, max_int '
                              'FROM iso_image '
                              'ORDER BY sf_id, adduct'))
            assert rows

            max_int = 0.0
            for r in rows:
                max_int = max(max_int, r[-1])
                assert tuple(r[:3]) == (0, 0, 10007)
            assert max_int

        finally:
            db.close()
            sc.close()
            with warn_only():
                local('rm -r {}'.format(data_dir_path))
