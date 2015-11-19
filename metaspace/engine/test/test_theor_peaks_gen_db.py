from mock import patch
import pytest
from os.path import join, realpath
from fabric.api import local

from engine.theor_peaks_gen import TheorPeaksGenerator
from engine.db import DB
from engine.test.util import spark_context, sm_config, ds_config


proj_dir_path = realpath('..')


@pytest.fixture(scope='module')
def create_test_db():
    db_config = dict(database='postgres', user='sm', host='localhost', password='1321')
    db = DB(db_config, autocommit=True)
    db.alter('CREATE DATABASE sm_test')
    db.close()

    local('psql -h localhost -U sm sm_test < {}'.format(join(proj_dir_path, 'scripts/create_schema.sql')))


@pytest.fixture(scope='module')
def drop_test_db(request):
    def fin():
        db_config = dict(database='postgres', user='sm', host='localhost', password='1321')
        db = DB(db_config, autocommit=True)
        db.alter('DROP DATABASE sm_test')
        db.close()
    request.addfinalizer(fin)


@pytest.fixture()
def create_fill_test_db(request, create_test_db, drop_test_db):

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.alter('TRUNCATE agg_formula')
    db.insert("INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)", [(0, 9, 'Au', ['04138'], ['Gold'])])
    db.alter('TRUNCATE theor_peaks')
    db.insert("INSERT INTO theor_peaks VALUES (%s, %s, %s, %s, %s, %s, %s)",
              [(0, 9, '+H', [100, 200], [100, 10], [], [])])
    db.close()


@patch('engine.theor_peaks_gen.get_iso_peaks')
def test_theor_peaks_generator_run_1(get_iso_peaks, create_fill_test_db, spark_context, sm_config, ds_config):
    get_iso_peaks.return_value = lambda *args: (9, '+Na', {'centr_mzs': [100., 200.],
                                                           'centr_ints': [10., 1.],
                                                           'profile_mzs': [],
                                                           'profile_ints': []})

    ds_config["isotope_generation"]["adducts"] = ["+H", "+Na"]

    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints FROM theor_peaks')

    assert len(rows) == 2
    assert rows[0] == (0, 9, '+H', [100., 200.], [100., 10.], [], [])
    assert rows[1] == (0, 9, '+Na', [100., 200.], [10., 1.], [], [])

    db.close()


@patch('engine.theor_peaks_gen.get_iso_peaks')
def test_theor_peaks_generator_run_2(get_iso_peaks, create_fill_test_db, spark_context, sm_config, ds_config):
    get_iso_peaks.return_value = lambda *args: None

    ds_config["isotope_generation"]["adducts"] = ["+H"]

    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select('SELECT db_id, sf_id, adduct, centr_mzs, centr_ints, prof_mzs, prof_ints FROM theor_peaks')

    assert len(rows) == 1

    db.close()
