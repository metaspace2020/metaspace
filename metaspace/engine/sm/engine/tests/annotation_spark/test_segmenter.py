from pathlib import Path
from unittest.mock import Mock, patch
import numpy as np
import pandas as pd
from itertools import product
from numpy.testing import assert_array_almost_equal

from sm.engine.annotation.imzml_reader import FSImzMLReader
from sm.engine.annotation_spark.segmenter import (
    segment_centroids,
    define_ds_segments,
    segment_ds,
    calculate_chunk_sp_n,
    fetch_chunk_spectra_data,
)
from tests.conftest import make_imzml_reader_mock


def test_calculate_chunk_sp_n():
    sample_mzs_bytes = 25 * 2 ** 20
    sample_sp_n = 10
    max_chunk_size_mb = 500

    chunk_sp_n = calculate_chunk_sp_n(sample_mzs_bytes, sample_sp_n, max_chunk_size_mb)

    assert chunk_sp_n == 50


def test_fetch_chunk_spectra_data():
    mz_n = 10
    imzml_reader = make_imzml_reader_mock(
        [(1, 1, 1), (2, 1, 1)], (np.linspace(0, 90, num=mz_n), np.ones(mz_n))
    )

    sp_chunk_df = fetch_chunk_spectra_data(sp_ids=[0, 1], imzml_reader=imzml_reader)

    exp_mzs, exp_ints = [
        np.sort([mz for mz in np.linspace(0, 90, num=mz_n) for _ in range(2)]),
        np.ones(2 * mz_n),
    ]

    assert sp_chunk_df.mz.dtype == 'f'
    assert_array_almost_equal(sp_chunk_df.mz, exp_mzs)
    assert_array_almost_equal(sp_chunk_df.int, exp_ints)


def test_define_ds_segments():
    imzml_reader = make_imzml_reader_mock(mz_precision='d')

    mz_max = 100
    sample_mzs = np.linspace(0, mz_max, 100)
    ds_segm_size_mb = 800 / (2 ** 20)  # 1600 b total data size / 2 segments, converted to MB
    ds_segments = define_ds_segments(
        sample_mzs, sample_ratio=1, imzml_reader=imzml_reader, ds_segm_size_mb=ds_segm_size_mb
    )

    exp_ds_segm_n = 8
    exp_bounds = [i * mz_max / exp_ds_segm_n for i in range(exp_ds_segm_n + 1)]
    exp_ds_segments = np.array(list(zip(exp_bounds[:-1], exp_bounds[1:])))
    assert ds_segments.shape == exp_ds_segments.shape
    assert np.allclose(ds_segments, exp_ds_segments)


@patch('sm.engine.annotation_spark.segmenter.pickle.dump')
def test_segment_ds(dump_mock):
    imzml_reader = make_imzml_reader_mock(
        list(product([0], range(10))), (np.linspace(0, 90, num=10), np.ones(10))
    )
    ds_segments = np.array([[0, 50], [50, 90.0]])

    chunk_sp_n = 1000
    segment_ds(imzml_reader, chunk_sp_n, ds_segments, Path('/tmp/abc'))

    for segm_i, ((sp_chunk_df, f), _) in enumerate(dump_mock.call_args_list):
        min_mz, max_mz = ds_segments[segm_i]

        assert sp_chunk_df.shape == (50, 3)
        assert np.all(min_mz <= sp_chunk_df.mz)
        assert np.all(sp_chunk_df.mz <= max_mz)


@patch('sm.engine.annotation_spark.segmenter.pickle.dump')
def test_segment_centroids(dump_mock):
    centr_df = pd.DataFrame(
        [
            (0, 0, 90),
            (0, 1, 100),
            (0, 2, 110),
            (1, 0, 100),
            (1, 1, 110),
            (1, 2, 120),
            (2, 0, 110),
            (2, 1, 120),
            (2, 2, 130),
        ],
        columns=['formula_i', 'peak_i', 'mz'],
    )
    segm_n = 3
    segment_centroids(centr_df, segm_n, Path('/tmp/abc'))

    for segm_i in range(segm_n):
        args, _ = dump_mock.call_args_list[segm_i]
        df, _ = args

        assert df.shape == (3, 4)
        assert set(df.formula_i) == {segm_i}
