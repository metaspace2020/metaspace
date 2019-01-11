import os
import sys
import numpy as np
import pandas as pd
import pytest
import shutil

from sm.engine.ion_centroids import IonCentroidsGenerator, IonCentroids
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.tests.util import test_db, sm_config, ds_config, pyspark_context

os.environ.setdefault('PYSPARK_PYTHON', sys.executable)


@pytest.fixture()
def clean_isotope_storage_path(sm_config):
    shutil.rmtree(sm_config['isotope_storage']['path'], ignore_errors=True)


def test_if_not_exist_returns_valid_df(pyspark_context, sm_config, ds_config, clean_isotope_storage_path):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centroids_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)
    centroids_gen._iso_gen_part_n = 1

    ion_centroids = centroids_gen.generate_if_not_exist(isocalc=isocalc,
                                                        formulas=['C2H4O8', 'C3H6O7', 'fake_mf'],
                                                        adducts=['+Na'])

    assert ion_centroids.centroids_df.shape == (2 * 4, 3)
    assert np.all(np.diff(ion_centroids.centroids_df.mz.values) >= 0)  # assert that dataframe is sorted by mz
    assert ion_centroids.ions_df.shape == (2, 2)


def test_save_restore_works(pyspark_context, sm_config, ds_config, clean_isotope_storage_path):
    ion_centroids = IonCentroids(ions_df=pd.DataFrame({'ion_i': [101, 101, 102, 102],
                                                       'formula': ['H2O', 'H2O', 'Au', 'Au'],
                                                       'adduct': ['+H', '-H', '+H', '-H']}).set_index('ion_i'),
                                 centroids_df=pd.DataFrame({'ion_i': [101, 101, 102, 102],
                                                            'peak_i': [0, 1, 0, 1],
                                                            'mz': [100., 200., 300., 400.],
                                                            'int': [100., 10., 100., 1.]}).set_index('ion_i'))

    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centr_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)
    centr_gen.save(ion_centroids)
    ion_centroids_restored = centr_gen.restore()

    from pandas.testing import assert_frame_equal
    assert_frame_equal(ion_centroids.ions_df.sort_index(), ion_centroids_restored.ions_df.sort_index())
    assert_frame_equal(ion_centroids.centroids_df.sort_index(), ion_centroids_restored.centroids_df.sort_index())


def test__generate_if_not_exist__new_custom_adduct(pyspark_context, sm_config, ds_config, clean_isotope_storage_path):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centr_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)
    ion_centroids = IonCentroids(ions_df=pd.DataFrame({'ion_i': [0, 1],
                                                       'formula': ['H2O', 'Au'],
                                                       'adduct': ['+H', '+H']})
                                 .set_index('ion_i'),
                                 centroids_df=pd.DataFrame({'ion_i': [0] * 4 + [1] * 4,
                                                            'peak_i': [0, 1, 2, 3] * 2,
                                                            'mz': [100., 200., 300., 400.] * 2,
                                                            'int': [100., 10., 100., 1.] * 2})
                                 .set_index('ion_i'))
    centr_gen.save(ion_centroids)

    ion_centroids = centr_gen.generate_if_not_exist(isocalc=isocalc, formulas=['H2O'], adducts=['+H', '+Na'])

    ions = ion_centroids.ions_subset(['+H', '+Na'])
    assert set(ions) == {('H2O', '+H'), ('Au', '+H'), ('H2O', '+Na')}
    centroids_df = ion_centroids.centroids_subset(ions)
    assert centroids_df.shape == (3 * 4, 3)


def test_centroids_subset_ordered_by_mz(pyspark_context, sm_config, ds_config, clean_isotope_storage_path):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centr_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)
    centr_gen._iso_gen_part_n = 1
    ion_centroids = centr_gen.generate_if_not_exist(isocalc=isocalc,
                                                    formulas=['C2H4O8', 'C3H6O7', 'C59H112O6', 'C62H108O'],
                                                    adducts=['+Na', '+H', '+K'])

    # ion_centroids = ion_centroids.centroids_subset([('C59H112O6', '+H'), ('C62H108O', '+Na')])
    assert ion_centroids.centroids_df.shape == (4 * 3 * 4, 3)
    assert np.all(np.diff(ion_centroids.centroids_df.mz.values) >= 0)  # assert that dataframe is sorted by mz
