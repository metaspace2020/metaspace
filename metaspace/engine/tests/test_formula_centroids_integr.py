import os
import sys
from itertools import product
import shutil

import numpy as np
import pandas as pd
import pytest

from sm.engine.annotation.formula_centroids import CentroidsGenerator, FormulaCentroids
from sm.engine.formula_parser import generate_ion_formula
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper

os.environ.setdefault('PYSPARK_PYTHON', sys.executable)


@pytest.fixture()
def clean_isotope_storage_path(sm_config):
    shutil.rmtree(sm_config['isotope_storage']['path'], ignore_errors=True)


def test_if_not_exist_returns_valid_df(spark_context, ds_config, clean_isotope_storage_path):
    isocalc = IsocalcWrapper(ds_config)
    centroids_gen = CentroidsGenerator(sc=spark_context, isocalc=isocalc)
    centroids_gen._iso_gen_part_n = 1

    ion_centroids = centroids_gen.generate_if_not_exist(
        formulas=['C2H4O8Na', 'C3H6O7Na', 'fake_mfNa']
    )

    assert ion_centroids.centroids_df(True).shape == (2 * 4, 3)
    assert np.all(
        np.diff(ion_centroids.centroids_df().mz.values) >= 0
    )  # assert that dataframe is sorted by mz
    assert ion_centroids.formulas_df.shape == (2, 1)


def test_save_restore_works(spark_context, ds_config, clean_isotope_storage_path):
    ion_centroids = FormulaCentroids(
        formulas_df=pd.DataFrame(
            {'formula_i': [101, 101, 102, 102], 'formula': ['H2O', 'H2O', 'Au', 'Au']}
        ).set_index('formula_i'),
        centroids_df=pd.DataFrame(
            {
                'formula_i': [101, 101, 102, 102],
                'peak_i': [0, 1, 0, 1],
                'mz': [100.0, 200.0, 300.0, 400.0],
                'int': [100.0, 10.0, 100.0, 1.0],
            }
        ).set_index('formula_i'),
    )

    isocalc = IsocalcWrapper(ds_config)
    centr_gen = CentroidsGenerator(sc=spark_context, isocalc=isocalc)
    centr_gen._save(ion_centroids)
    formula_centroids_restored = centr_gen._restore()

    from pandas.testing import assert_frame_equal

    assert_frame_equal(
        ion_centroids.formulas_df.sort_index(), formula_centroids_restored.formulas_df.sort_index()
    )
    assert_frame_equal(
        ion_centroids.centroids_df().sort_index(),
        formula_centroids_restored.centroids_df().sort_index(),
    )


def test_centroids_subset_ordered_by_mz(spark_context, ds_config, clean_isotope_storage_path):
    isocalc = IsocalcWrapper(ds_config)
    centr_gen = CentroidsGenerator(sc=spark_context, isocalc=isocalc)
    centr_gen._iso_gen_part_n = 1
    formulas = [
        generate_ion_formula(f, a)
        for f, a in product(['C2H4O8', 'C3H6O7', 'C59H112O6', 'C62H108O'], ['+Na', '+H', '[M]+'])
    ]
    formula_centroids = centr_gen.generate_if_not_exist(formulas)

    assert formula_centroids.centroids_df(True).shape == (4 * 3 * 4, 3)
    assert np.all(
        np.diff(formula_centroids.centroids_df().mz.values) >= 0
    )  # assert that dataframe is sorted by mz
