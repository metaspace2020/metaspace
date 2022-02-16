from itertools import product
from unittest.mock import patch

import pandas as pd
from pandas.util.testing import assert_frame_equal
from scipy.sparse import coo_matrix

from sm.engine.annotation.formula_validator import (
    formula_image_metrics,
    make_compute_image_metrics,
    FormulaImageItem,
)
from sm.engine.annotation.metrics import weighted_stddev
from sm.engine.ds_config import DSConfigImageGeneration, DSConfig
from tests.conftest import make_imzml_reader_mock


def _test_compute_metrics():
    ds_config = DSConfig(
        analysis_version=1,
        image_generation=DSConfigImageGeneration(
            ppm=3.0, n_levels=30, min_px=1, compute_unused_metrics=False
        ),
        # Unused fields
        database_ids=None,
        isotope_generation=None,
        fdr=None,
    )
    imzml_reader = make_imzml_reader_mock(list(product(range(2), range(3))))
    compute_metrics = make_compute_image_metrics(imzml_reader, ds_config)
    return compute_metrics


@patch('sm.engine.annotation.formula_validator.spectral_metric')
@patch('sm.engine.annotation.formula_validator.spatial_metric')
@patch('sm.engine.annotation.formula_validator.chaos_metric')
def test_formula_image_metrics(chaos_mock, spatial_mock, spectral_mock):
    spectral_mock.side_effect = lambda imgs_flat, *args: imgs_flat[0][0]
    spatial_mock.side_effect = lambda imgs_flat, *args, **kwargs: imgs_flat[0][1]
    chaos_mock.side_effect = lambda img, *args: img[0, 2]

    # Images 2 & 3 combine to equal image 1
    # First 3 intensities get used as spectral, spatial & chaos metrics
    image1 = coo_matrix([[1.0, 0.9, 0.8], [0.7, 0.0, 0.5]])
    image2 = coo_matrix([[1.0, 0.0, 0.0], [0.7, 0.0, 0.0]])
    image3 = coo_matrix([[0.0, 0.9, 0.8], [0.0, 0.0, 0.5]])
    mz_image1 = coo_matrix([[9.0, 10.0, 11.0], [11.0, 0.0, 9.0]])
    mz_image2 = coo_matrix([[9.0, 0.0, 0.0], [11.0, 0.0, 0.0]])
    mz_image3 = coo_matrix([[0.0, 10.0, 11.0], [0.0, 0.0, 9.0]])

    ref_image_items = [
        # Formula 1 is normal
        FormulaImageItem(1, 0, 10, 100, False, image1, mz_image1),
        FormulaImageItem(1, 1, 11, 10, False, image1, mz_image1),
        # Formula 2 is split on both peaks
        FormulaImageItem(2, 0, 10, 100, True, image2, mz_image2),
        FormulaImageItem(2, 0, 10, 100, False, image3, mz_image3),
        FormulaImageItem(2, 1, 11, 10, True, image2, mz_image2),
        FormulaImageItem(2, 1, 11, 10, False, image3, mz_image3),
        # Formula 3 isn't split, but covers the edge case where may_be_split is a false positive
        FormulaImageItem(3, 0, 10, 100, True, image1, mz_image1),
        FormulaImageItem(3, 1, 11, 10, True, image1, mz_image1),
    ]

    metrics_df, _ = formula_image_metrics(
        ref_image_items,
        _test_compute_metrics(),
        target_formula_inds={1, 2, 3},
        targeted_database_formula_inds=set(),
        n_peaks=2,
        min_px=1,
        compute_unused_metrics=False,
    )

    expected_stddev = weighted_stddev(mz_image1.data, image1.data)[1]
    expected_metrics = {
        'chaos': 0.8,
        'spatial': 0.9,
        'spectral': 1.0,
        'msm': 1.0 * 0.9 * 0.8,
        'total_iso_ints': [image1.sum(), image1.sum()],
        'min_iso_ints': [0, 0],
        'max_iso_ints': [image1.max(), image1.max()],
        'mz_mean': [10.0, 10.0],
        'mz_stddev': [expected_stddev, expected_stddev],
        'mz_err_abs': 0.0,
        'mz_err_rel': -1.0,  # mz_mean is 10 but theo_mz is 11, so error is -1
        'theo_mz': [10, 11],
        'theo_ints': [100, 10],
    }
    expected_metrics_df = pd.DataFrame(
        [expected_metrics] * 3, index=pd.Index([1, 2, 3], name='formula_i')
    )
    assert_frame_equal(metrics_df, expected_metrics_df)


@patch('sm.engine.annotation.formula_validator.spectral_metric', return_value=0.9)
@patch('sm.engine.annotation.formula_validator.spatial_metric', return_value=0.8)
@patch('sm.engine.annotation.formula_validator.chaos_metric', return_value=0.7)
def test_targeted_database_metrics(chaos_mock, spatial_mock, spectral_mock):
    image = coo_matrix([[1.0, 0.9, 0.8], [0.7, 0.0, 0.5]])
    empty_image = coo_matrix([[0.0, 0.0, 0.8], [0.0, 0.0, 0.0]])
    mz_image = coo_matrix([[9.0, 10.0, 11.0], [11.0, 0.0, 9.0]])

    ref_image_items = [
        # first formula first peak only
        FormulaImageItem(1, 0, 10, 100, False, image, mz_image),
        # second formula second peak only
        FormulaImageItem(2, 1, 11, 10, False, image, mz_image),
        # third formula first peak empty image
        FormulaImageItem(3, 0, 10, 100, True, empty_image, empty_image),
        FormulaImageItem(3, 1, 11, 10, True, image, mz_image),
        # fourth formula first peak null
        FormulaImageItem(4, 0, 10, 100, True, None, None),
        FormulaImageItem(4, 1, 11, 10, True, image, mz_image),
        # fifth formula no images
        FormulaImageItem(5, 0, 10, 100, True, None, None),
        FormulaImageItem(5, 1, 11, 10, True, None, None),
    ]

    metrics_df, _ = formula_image_metrics(
        ref_image_items,
        _test_compute_metrics(),
        target_formula_inds={1, 2, 3, 4, 5},
        targeted_database_formula_inds={1, 2, 3, 4, 5},
        n_peaks=2,
        min_px=1,
        compute_unused_metrics=False,
    )

    msm = 0.9 * 0.8 * 0.7
    exp_metrics_df = pd.DataFrame(
        {
            'msm': msm,
            'spectral': 0.9,
            'spatial': 0.8,
            'chaos': 0.7,
        },
        index=pd.Index([1, 2, 3, 4, 5], name='formula_i'),
    )
    obs_metrics_df = metrics_df[['msm', 'spectral', 'spatial', 'chaos']].sort_index()
    assert_frame_equal(obs_metrics_df, exp_metrics_df)
