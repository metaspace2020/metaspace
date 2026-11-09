from typing import Dict, Optional

import numpy as np
import pandas as pd

TOLERANCES: Dict[str, float] = {
    'NUM_TIGHT': 1e-9,
    'NUM_METRIC': 1e-6,
    'NUM_ORDER': 1e-4,
    'FDR_SAME_DECOYS': 1e-9,
}
IMG_SIM_MIN_PEARSON = 0.9999


def _prefix(label):
    return f'[{label}] ' if label else ''


def _compare_arrays(actual, expected, tol, label):
    actual = np.asarray(actual, dtype=float)
    expected = np.asarray(expected, dtype=float)
    if actual.shape != expected.shape:
        raise AssertionError(
            f'{_prefix(label)}shape mismatch: actual {actual.shape}, expected {expected.shape}'
        )
    if not np.array_equal(np.isnan(actual), np.isnan(expected)):
        raise AssertionError(f'{_prefix(label)}NaN positions differ')
    diff = np.abs(np.nan_to_num(actual) - np.nan_to_num(expected))
    if diff.size == 0:
        return
    atol = TOLERANCES[tol]
    worst = int(np.argmax(diff))
    if diff.flat[worst] > atol:
        raise AssertionError(
            f'{_prefix(label)}{tol} (abs {atol}) exceeded: max abs diff {diff.flat[worst]:.3e} '
            f'at index {worst}, actual {actual.flat[worst]!r}, expected {expected.flat[worst]!r}'
        )


def assert_close(actual, expected, tol: str, label: str = '') -> None:
    if isinstance(expected, pd.DataFrame):
        if not isinstance(actual, pd.DataFrame):
            raise AssertionError(f'{_prefix(label)}expected a DataFrame')
        if list(actual.columns) != list(expected.columns):
            raise AssertionError(
                f'{_prefix(label)}columns differ: {list(actual.columns)} vs {list(expected.columns)}'
            )
        if not actual.index.equals(expected.index):
            raise AssertionError(f'{_prefix(label)}index differs')
        for col in expected.columns:
            _compare_arrays(actual[col].values, expected[col].values, tol, f'{label}.{col}')
        return
    _compare_arrays(actual, expected, tol, label)


def assert_exact(actual, expected, label: str = '') -> None:
    if isinstance(expected, pd.DataFrame):
        if not isinstance(actual, pd.DataFrame):
            raise AssertionError(f'{_prefix(label)}expected a DataFrame')
        if list(actual.columns) != list(expected.columns) or not actual.index.equals(
            expected.index
        ):
            raise AssertionError(f'{_prefix(label)}columns or index differ')
        for col in expected.columns:
            assert_exact(actual[col].values, expected[col].values, f'{label}.{col}')
        return
    actual = np.asarray(actual)
    expected = np.asarray(expected)
    if actual.shape != expected.shape:
        raise AssertionError(
            f'{_prefix(label)}shape mismatch: actual {actual.shape}, expected {expected.shape}'
        )
    if actual.dtype.kind in 'fc' or expected.dtype.kind in 'fc':
        equal = (actual == expected) | (pd.isnull(actual) & pd.isnull(expected))
    else:
        equal = actual == expected
    if not np.all(equal):
        worst = int(np.argmin(np.asarray(equal).ravel()))
        raise AssertionError(
            f'{_prefix(label)}not exactly equal at index {worst}: '
            f'actual {actual.flat[worst]!r}, expected {expected.flat[worst]!r}'
        )


def assert_img_sim(actual: np.ndarray, expected: np.ndarray, label: str = '') -> None:
    actual = np.asarray(actual, dtype=float)
    expected = np.asarray(expected, dtype=float)
    if actual.shape != expected.shape:
        raise AssertionError(f'{_prefix(label)}image shape mismatch')
    if not np.array_equal(actual != 0, expected != 0):
        raise AssertionError(f'{_prefix(label)}nonzero masks differ')
    if not np.any(expected):
        return
    a_flat, e_flat = actual.ravel(), expected.ravel()
    if np.ptp(a_flat) == 0 and np.ptp(e_flat) == 0:
        return
    pearson = np.corrcoef(a_flat, e_flat)[0, 1]
    if not pearson >= IMG_SIM_MIN_PEARSON:
        raise AssertionError(f'{_prefix(label)}Pearson {pearson:.6f} < {IMG_SIM_MIN_PEARSON}')


def assert_tree(actual, expected, tol: Optional[str] = None, label: str = '') -> None:
    if isinstance(expected, dict):
        if not isinstance(actual, dict) or set(actual) != set(expected):
            only_actual = sorted(set(actual) - set(expected)) if isinstance(actual, dict) else '?'
            only_expected = sorted(set(expected) - set(actual)) if isinstance(actual, dict) else '?'
            raise AssertionError(
                f'{_prefix(label)}keys differ: only in actual {only_actual[:5]}, '
                f'only in reference {only_expected[:5]}'
            )
        for key in sorted(expected):
            assert_tree(actual[key], expected[key], tol, f'{label}.{key}' if label else str(key))
        return
    if actual is None or expected is None:
        if not (actual is None and expected is None):
            raise AssertionError(f'{_prefix(label)}None mismatch: {actual!r} vs {expected!r}')
        return
    if tol is None or np.asarray(expected).dtype.kind in 'USOb':
        assert_exact(actual, expected, label)
    else:
        assert_close(actual, expected, tol, label)
