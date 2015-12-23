from mock import patch
import pytest
from os.path import join, realpath

from engine.theor_peaks_gen import TheorPeaksGenerator
from engine.db import DB
from engine.test.util import spark_context, sm_config, ds_config, create_test_db, drop_test_db


@pytest.fixture()
def create_fill_test_db(create_test_db, drop_test_db):

    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    db.alter('TRUNCATE agg_formula CASCADE')
    db.insert('INSERT INTO formula VALUES (%s, %s, %s, %s, %s)', [(0, '04138', 9, 'Au', 'Gold')])
    db.insert('INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)', [(0, 9, 'Au', ['04138'], ['Gold'])])
    db.alter('TRUNCATE theor_peaks CASCADE')
    db.insert('INSERT INTO theor_peaks VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
              [(0, 9, '+H', 0.01, 1, 10000, [100, 200], [10, 1], [100, 200], [10, 1])])
    db.close()


def test_theor_peaks_generator_run_1(create_fill_test_db, spark_context, sm_config, ds_config):
    ds_config["isotope_generation"]["adducts"] = ["+H", "+Na"]
    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.isocalc_wrapper._iso_peaks = lambda *args: {'centr_mzs': [100., 200.],
                                                                'centr_ints': [10., 1.],
                                                                'profile_mzs': [100., 200.],
                                                                'profile_ints': [10., 1.]}
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select(('SELECT db_id, sf_id, adduct, sigma, charge, pts_per_mz, centr_mzs, '
                      'centr_ints, prof_mzs, prof_ints FROM theor_peaks ORDER BY sf_id, adduct'))

    assert len(rows) == 2
    assert rows[0] == (0, 9, '+H', 0.01, 1, 10000, [100., 200.], [10., 1.], [100., 200.], [10., 1.])
    assert rows[1] == (0, 9, '+Na', 0.01, 1, 10000, [100., 200.], [10., 1.], [100., 200.], [10., 1.])

    db.close()


def test_theor_peaks_generator_run_failed_iso_peaks(create_fill_test_db, spark_context, sm_config, ds_config):
    ds_config["isotope_generation"]["adducts"] = ["+Na"]
    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.isocalc_wrapper._iso_peaks = lambda *args: {'centr_mzs': [],
                                                                'centr_ints': [],
                                                                'profile_mzs': [],
                                                                'profile_ints': []}
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select('SELECT * FROM theor_peaks')

    assert len(rows) == 1

    db.close()
