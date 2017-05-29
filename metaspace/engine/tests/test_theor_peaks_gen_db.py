import pytest
from mock import MagicMock

from sm.engine import MolecularDB
from sm.engine.db import DB
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.isocalc_wrapper import Centroids
from sm.engine.tests.util import test_db, spark_context, sm_config, ds_config


@pytest.fixture()
def create_fill_test_db(test_db):
    db_config = dict(database='sm_test', user='sm', host='localhost', password='1321')
    db = DB(db_config)
    try:
        db.alter('TRUNCATE sum_formula CASCADE')
        db.insert('INSERT INTO sum_formula VALUES (%s, %s, %s)', [(9, 0, 'Au')])
        db.alter('TRUNCATE theor_peaks CASCADE')
        db.insert('INSERT INTO theor_peaks VALUES (%s, %s, %s, %s, %s, %s, %s)',
                  [('Au', '+H', 0.01, 1, 10000, [100, 200], [10, 1])])
    except:
        raise
    finally:
        db.close()


def test_theor_peaks_generator_run_failed_iso_peaks(create_fill_test_db, spark_context, sm_config, ds_config):
    ds_config["isotope_generation"]["adducts"] = ["+Na"]
    mol_db_mock = MagicMock(MolecularDB)
    mol_db_mock.sfs.return_value = {}

    theor_peaks_gen = TheorPeaksGenerator(spark_context, mol_db_mock, ds_config)
    theor_peaks_gen._isocalc_wrapper.isotope_peaks = lambda *args: Centroids(None, None)
    theor_peaks_gen.run()

    db = DB(sm_config['db'])
    rows = db.select('SELECT * FROM theor_peaks')

    assert len(rows) == 1

    db.close()
