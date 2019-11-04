from pathlib import Path
from unittest.mock import Mock, patch
import numpy as np
import pandas as pd
from itertools import product
from numpy.testing import assert_array_almost_equal

from sm.engine.msm_basic.segmenter import (
    segment_centroids,
    define_ds_segments,
    segment_ds,
    calculate_chunk_sp_n,
    fetch_chunk_spectra_data,
)


def test_calculate_chunk_sp_n():
    sample_mzs_bytes = 25 * 2 ** 20
    sample_sp_n = 10
    max_chunk_size_mb = 500

    chunk_sp_n = calculate_chunk_sp_n(sample_mzs_bytes, sample_sp_n, max_chunk_size_mb)

    assert chunk_sp_n == 50


def test_fetch_chunk_spectra_data():
    mz_n = 10
    imzml_parser_mock = Mock()
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 90, num=mz_n), np.ones(mz_n))
    imzml_parser_mock.mzPrecision = 'f'
    sp_id_to_idx = {0: 0, 1: 1}

    sp_mz_int_buf = fetch_chunk_spectra_data(
        sp_ids=[0, 1], imzml_parser=imzml_parser_mock, sp_id_to_idx=sp_id_to_idx
    )

    exp_sp_mz_int_buf = np.vstack(
        [np.sort([mz for mz in np.linspace(0, 90, num=mz_n) for _ in range(2)]), np.ones(2 * mz_n)]
    ).T
    assert sp_mz_int_buf.dtype == 'f'
    assert_array_almost_equal(sp_mz_int_buf[:, 1:], exp_sp_mz_int_buf)


def test_define_ds_segments():
    sample_mzs = np.linspace(0, 100, 100)

    # 3 (columns) * 10 (spectra) * 10 (mz/spectrum) * 8 (float prec) ~= 2400 (dataset size, bytes)
    # 2400 // 2**10 (segm size, bytes) ~= 2 (segments)
    ds_segments = define_ds_segments(
        sample_mzs, mz_precision='d', total_mz_n=100, ds_segm_size_mb=2 ** -10
    )

    exp_ds_segments = np.array([[0, 50.0], [50, 100.0]])
    assert np.allclose(ds_segments, exp_ds_segments)


@patch('sm.engine.msm_basic.segmenter.pq.ParquetWriter.write_table')
def test_segment_ds(write_table_mock):
    imzml_parser_mock = Mock()
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 90, num=10), np.ones(10))
    imzml_parser_mock.mzPrecision = 'f'
    coordinates = list(product([0], range(10)))
    ds_segments = np.array([[0, 50], [50, 90.0]])

    chunk_sp_n = 1000
    segment_ds(imzml_parser_mock, coordinates, chunk_sp_n, ds_segments, Path('/tmp/abc'))

    for segm_i, (min_mz, max_mz) in enumerate(ds_segments):
        args = write_table_mock.call_args_list[segm_i][0]
        segm_arr = args[0].to_pandas().values

        assert segm_arr.shape == (50, 3)
        # mz stored in column 1
        assert np.all(min_mz <= segm_arr[:, 1])
        assert np.all(segm_arr[:, 1] <= max_mz)


@patch('sm.engine.msm_basic.segmenter.pq.ParquetWriter.write_table')
def test_segment_centroids(write_table_mock):
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
        args = write_table_mock.call_args_list[segm_i][0]
        df = args[0].to_pandas()

        assert df.shape == (3, 4)
        assert set(df.formula_i) == {segm_i}
