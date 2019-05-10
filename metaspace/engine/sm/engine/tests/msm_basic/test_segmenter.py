from pathlib import Path
from unittest.mock import MagicMock, Mock, patch
import numpy as np
import pandas as pd
from itertools import product
from pyimzml import ImzMLParser

from sm.engine.msm_basic.segmenter import segment_centroids, define_ds_segments, segment_spectra, MAX_MZ_VALUE


def test_define_ds_segments():
    imzml_parser_mock = Mock()
    imzml_parser_mock.coordinates = list(product([0], range(10)))
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 100, num=11), np.ones(11))

    exp_ds_segments = np.array([[0, 50.], [50, 100.]])

    # 3 (columns) * 10 (spectra) * 10 (mz/spectrum) * 8 (float prec) ~= 2400 (dataset size, bytes)
    # 2400 // 2**10 (segm size, bytes) ~= 2 (segments)
    ds_segments = define_ds_segments(imzml_parser_mock, sample_ratio=0.5, ds_segm_size_mb=2**-10)

    assert np.allclose(ds_segments, exp_ds_segments)


@patch('sm.engine.msm_basic.segmenter.pd.to_msgpack')
def test_segment_spectra(to_msgpack_mock):
    imzml_parser_mock = Mock()
    imzml_parser_mock.getspectrum.return_value = (np.linspace(0, 90, num=10), np.ones(10))
    imzml_parser_mock.mzPrecision = 'f'
    coordinates = list(product([0], range(10)))
    ds_segments = np.array([[0, 50], [50, 90.]])

    segment_spectra(imzml_parser_mock, coordinates, ds_segments, Path('/tmp/abc'))

    for segm_i, (min_mz, max_mz) in enumerate(ds_segments):
        args = to_msgpack_mock.call_args_list[segm_i][0]
        segm_arr = args[1]

        assert segm_arr.shape == (50, 3)
        # mz stored in column 1
        assert np.all(min_mz <= segm_arr[:,1])
        assert np.all(segm_arr[:, 1] <= max_mz)


@patch('sm.engine.msm_basic.segmenter.pd.to_msgpack')
def test_segment_centroids(to_msgpack_mock):
    centr_df = pd.DataFrame([(0, 0, 90),
                             (0, 1, 100),
                             (0, 2, 110),
                             (1, 0, 100),
                             (1, 1, 110),
                             (1, 2, 120),
                             (2, 0, 110),
                             (2, 1, 120),
                             (2, 2, 130)],
                            columns=['formula_i', 'peak_i', 'mz'])
    segm_n = 3
    segment_centroids(centr_df, segm_n, Path('/tmp/abc'))

    for segm_i in range(segm_n):
        args = to_msgpack_mock.call_args_list[segm_i][0]
        df = args[1]

        assert df.shape == (3, 4)
        assert set(df.formula_i) == {segm_i}
