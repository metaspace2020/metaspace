import pytest

from sm.engine.db import DB
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.isocalc_wrapper import Centroids
from sm.engine.tests.util import create_test_db, drop_test_db, spark_context, sm_config, ds_config


@pytest.fixture()
def create_fill_test_db(create_test_db, drop_test_db):
    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    try:
        db.alter('TRUNCATE formula_db CASCADE')
        db.insert('INSERT INTO formula_db VALUES (%s, %s, %s)', [(0, '2016-01-01', 'HMDB')])
        db.insert('INSERT INTO formula VALUES (%s, %s, %s, %s, %s)', [(9, 0, '04138', 'Au', 'Gold')])
        db.insert('INSERT INTO agg_formula VALUES (%s, %s, %s, %s, %s)', [(9, 0, 'Au', ['04138'], ['Gold'])])
        db.alter('TRUNCATE theor_peaks CASCADE')
        db.insert('INSERT INTO theor_peaks VALUES (%s, %s, %s, %s, %s, %s, %s)',
                  [('Au', '+H', 0.01, 1, 10000, [100, 200], [10, 1])])
    except:
        raise
    finally:
        db.close()


def test_theor_peaks_generator_run_1(create_fill_test_db, spark_context, sm_config, ds_config):
    ds_config["isotope_generation"]["adducts"] = ["+H", "+Na"]
    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.isocalc_wrapper.isotope_peaks = lambda *args: Centroids([100., 200.], [10., 1.])
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select(('SELECT sf, adduct, sigma, charge, pts_per_mz, centr_mzs, centr_ints '
                      'FROM theor_peaks ORDER BY sf, adduct'))

    assert len(rows) == 2 + 80
    assert (filter(lambda r: r[1] == '+H', rows)[0] ==
            ('Au', '+H', 0.01, 1, 10000, [100., 200.], [10., 1.]))
    assert (filter(lambda r: r[1] == '+Na', rows)[0] ==
            ('Au', '+Na', 0.01, 1, 10000, [100., 200.], [10., 1.]))

    db.close()


def test_theor_peaks_generator_run_failed_iso_peaks(create_fill_test_db, spark_context, sm_config, ds_config):
    ds_config["isotope_generation"]["adducts"] = ["+Na"]
    theor_peaks_gen = TheorPeaksGenerator(spark_context, sm_config, ds_config)
    theor_peaks_gen.isocalc_wrapper.isotope_peaks = lambda *args: Centroids([], [])
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select('SELECT * FROM theor_peaks')

    assert len(rows) == 1

    db.close()
