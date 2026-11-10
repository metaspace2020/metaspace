import numpy as np
import pandas as pd
import pytest

from tests.consistency.tolerances import RTOLS, TOLERANCES, assert_close, assert_exact


def test_assert_close_within_tolerance_passes():
    assert_close(np.array([1.0, 2.0]), np.array([1.0, 2.0 + 5e-7]), 'NUM_METRIC')


def test_assert_close_over_tolerance_reports_worst_index():
    actual = np.array([1.0, 2.0, 3.0, 4.0 + 2e-6])
    expected = np.array([1.0, 2.0, 3.0, 4.0])
    with pytest.raises(AssertionError) as exc:
        assert_close(actual, expected, 'NUM_METRIC', label='spatial')
    message = str(exc.value)
    assert 'spatial' in message
    assert 'NUM_METRIC' in message
    assert 'index 3' in message


def test_assert_close_nan_equal():
    assert_close(np.array([1.0, np.nan]), np.array([1.0, np.nan]), 'NUM_TIGHT')
    assert_close(float('nan'), float('nan'), 'NUM_TIGHT')


def test_assert_close_dataframe_column_mismatch_fails():
    left = pd.DataFrame({'a': [1.0], 'b': [2.0]})
    right = pd.DataFrame({'a': [1.0], 'c': [2.0]})
    with pytest.raises(AssertionError):
        assert_close(left, right, 'NUM_TIGHT')


def test_assert_close_dataframe_passes():
    frame = pd.DataFrame({'a': [1.0, np.nan], 'b': [2.0, 3.0]})
    assert_close(frame, frame.copy(), 'NUM_TIGHT')


def test_assert_exact_rejects_one_ulp():
    value = 1.0
    with pytest.raises(AssertionError):
        assert_exact(np.array([np.nextafter(value, 2.0)]), np.array([value]))


def test_assert_exact_nan_equal():
    assert_exact(np.array([1.0, np.nan]), np.array([1.0, np.nan]))


def test_tolerance_keys():
    assert set(TOLERANCES) == {
        'NUM_TIGHT',
        'NUM_METRIC',
        'NUM_ORDER',
        'FDR_SAME_DECOYS',
        'MASS_ERR',
        'PNG_LEVEL',
    }


def _grey_levels():
    return np.linspace(0, 65535, 50).reshape(5, 10)


def test_png_level_rejects_rescaled_image():
    levels = _grey_levels()
    with pytest.raises(AssertionError):
        assert_close(levels * 0.5, levels, 'PNG_LEVEL')


def test_png_level_accepts_one_level_error():
    levels = _grey_levels()
    assert_close(levels + 1, levels, 'PNG_LEVEL')
    with pytest.raises(AssertionError):
        assert_close(levels + 2, levels, 'PNG_LEVEL')


def test_png_level_constant_image_passes_when_equal():
    constant = np.full((4, 4), 1234.0)
    assert_close(constant, constant.copy(), 'PNG_LEVEL')


def test_mass_err_rejects_ten_percent_change():
    with pytest.raises(AssertionError):
        assert_close(np.array([2.2e-4]), np.array([2e-4]), 'MASS_ERR')
    assert_close(np.array([2.2e-4]), np.array([2e-4]), 'NUM_ORDER')


def test_mass_err_accepts_rounding_noise():
    expected = np.array([2e-4, 500.0])
    assert_close(expected * (1 + RTOLS['MASS_ERR'] / 10), expected, 'MASS_ERR')


def test_mass_err_zero_expected_uses_absolute_floor():
    floor = TOLERANCES['MASS_ERR']
    assert_close(np.array([floor / 2]), np.array([0.0]), 'MASS_ERR')
    with pytest.raises(AssertionError):
        assert_close(np.array([floor * 10]), np.array([0.0]), 'MASS_ERR')


def test_mass_err_nan_positions_must_match():
    with pytest.raises(AssertionError):
        assert_close(np.array([np.nan, 1.0]), np.array([1.0, np.nan]), 'MASS_ERR')


def test_assert_tree_nested_numeric_and_strings():
    from tests.consistency.tolerances import assert_tree

    expected = {'a': [1.0, 2.0], 'b': {'c': ['x', 'y'], 'd': None}}
    actual = {'a': np.array([1.0, 2.0 + 1e-10]), 'b': {'c': ['x', 'y'], 'd': None}}
    assert_tree(actual, expected, 'NUM_TIGHT')


def test_assert_tree_key_mismatch_names_keys():
    from tests.consistency.tolerances import assert_tree

    with pytest.raises(AssertionError) as exc:
        assert_tree({'a': 1.0, 'z': 2.0}, {'a': 1.0, 'b': 2.0}, 'NUM_TIGHT')
    assert 'z' in str(exc.value) and 'b' in str(exc.value)
