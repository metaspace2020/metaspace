import pytest
from unittest.mock import MagicMock
import os
import sys
import numpy as np
import pandas as pd
from numpy.testing import assert_almost_equal
from pyspark.sql import SparkSession

from sm.engine import MolecularDB
from sm.engine.db import DB
from sm.engine.ion_centroids_gen import IonCentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.tests.util import test_db, sm_config, ds_config, pyspark_context


os.environ.setdefault('PYSPARK_PYTHON', sys.executable)


def test_generate_returns_valid_df(pyspark_context, sm_config, ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centroids_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)
    centroids_gen._iso_gen_part_n = 1
    centroids_gen.generate(isocalc=isocalc, sfs=['C2H4O8', 'C3H6O7', 'fake_mf'], adducts=['+Na'])

    assert centroids_gen.ion_centroids_df.shape == (8, 3)
    assert np.all(np.diff(centroids_gen.ion_centroids_df.mz.values) >= 0)  # assert that dataframe is sorted by mz

    assert centroids_gen.ion_df.shape == (2, 2)


def test_save_restore_works(pyspark_context, sm_config, ds_config):
    isocalc = IsocalcWrapper(ds_config['isotope_generation'])
    centr_gen = IonCentroidsGenerator(sc=pyspark_context, moldb_name='HMDB', isocalc=isocalc)

    centr_gen.ion_centroids_df = pd.DataFrame({'ion_i': [101, 101, 102, 102],
                                               'peak_i': [0, 1, 0, 1],
                                               'mz': [100., 200., 300., 400.],
                                               'int': [100., 10., 100., 1.]}).set_index('ion_i')
    centr_gen.ion_df = pd.DataFrame({'ion_i': [101, 101, 102, 102],
                                     'sf': ['H2O', 'H2O', 'Au', 'Au'],
                                     'adduct': ['+H', '-H', '+H', '-H']}).set_index('ion_i')
    centr_gen.save()
    centr_gen.restore()

    df = centr_gen.centroids_subset(ions=[('H2O', '-H')])
    assert df.index.unique().tolist() == [101]
