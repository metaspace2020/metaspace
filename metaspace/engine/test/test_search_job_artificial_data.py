from os.path import join, dirname

import numpy as np
import pytest
from fabric.api import local
from fabric.context_managers import warn_only
from mock import patch, PropertyMock

from engine.db import DB
from engine.search_job import SearchJob
from pyspark import SparkContext

# from engine.util import hdfs_prefix

proj_dir_path = dirname(dirname(__file__))


@pytest.fixture(scope='module')
def create_fill_sm_database(create_test_db, drop_test_db):
    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.insert("INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)", [(0, 9, 'Au', ['04138'], ['Gold'])])
    db.close()


@pytest.fixture
def create_work_dir(request, sm_config):
    with warn_only():
        local('mkdir -p {}/test_ds'.format(sm_config['fs']['data_dir']))
        # local(hdfs_prefix() + '-mkdir {}/test_ds'.format(sm_config['fs']['data_dir']))

    def fin():
        local('rm -rf {}/test_ds'.format(sm_config['fs']['data_dir']))
        # local(hdfs_prefix() + '-rm -r {}/test_ds'.format(sm_config['fs']['data_dir']))

    request.addfinalizer(fin)


@patch('engine.search_job.SearchJob._read_config')
@patch('engine.search_job.WorkDir.copy_input_data')
@patch('engine.search_job.WorkDir.imzml_path')
def test_search_job_artificial_data(read_config_mock, copy_input_data_mock, imzml_path_mock,
                                    create_fill_sm_database, create_work_dir,
                                    sm_config, ds_config):
    imzml_path_mock.__get__ = PropertyMock(return_value='/tmp/foo.imzML')

    with patch('engine.search_job.SparkContext') as sc_mock:
        sc_mock.return_value = SparkContext(master='local[2]')

        with patch('engine.imzml_txt_converter.ImzMLParser') as ImzMLParserMock:
            mock_parser = ImzMLParserMock.return_value
            mock_parser.coordinates = [[0, 0], [1, 1], [0, 1], [2, 0], [2, 1]]
            mock_parser.getspectrum.side_effect = [(np.array([197.973847]), np.array([100.])),
                                                   (np.array([197.973847]), np.array([0.])),
                                                   (np.array([197.973847]), np.array([0.])),
                                                   (np.array([197.973847]), np.array([0.])),
                                                   (np.array([198.98012]), np.array([10.]))]

            job = SearchJob('test_ds', '')
            job.sm_config = sm_config
            job.ds_config = ds_config
            job.run('')

            db = DB(sm_config['db'])
            try:
                # dataset meta asserts
                rows = db.select('SELECT id, name, file_path, img_bounds from dataset')
                img_bounds = {u'y': {u'max': 1, u'min': 0}, u'x': {u'max': 2, u'min': 0}}
                file_path = join(sm_config['fs']['data_dir'], ds_config['name'], 'test_ds.imzML')
                assert rows == [(0, 'test_ds', file_path, img_bounds)]

                # theoretical patterns asserts
                rows = db.select(('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints '
                                  'FROM theor_peaks'))

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
                rows = db.select(('SELECT job_id, db_id, sf_id, adduct, peak, '
                                  'pixel_inds, intensities, min_int, max_int '
                                  'FROM iso_image'))

                assert rows
                assert len(rows) == 2

                assert tuple(rows[0][:5]) == (0, 0, 9, '+H', 0)
                assert rows[0][5] == [0]
                assert rows[0][6] == [100.]
                assert tuple(rows[0][7:]) == (0, 100)

                assert tuple(rows[1][:5]) == (0, 0, 9, '+H', 1)
                assert rows[1][5] == [5]
                assert rows[1][6] == [10.]
                assert tuple(rows[1][7:]) == (0, 10)

            finally:
                db.close()
