from typing import Dict, Optional

import numpy as np
import pandas as pd

TOLERANCES: Dict[str, float] = {
    'NUM_TIGHT': 1e-9,
    'NUM_METRIC': 1e-6,
    'NUM_ORDER': 1e-4,
    'FDR_SAME_DECOYS': 1e-9,
    'MASS_ERR': 1e-12,
    'PNG_LEVEL': 1.0,
}
RTOLS: Dict[str, float] = {'MASS_ERR': 1e-9}


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
    rtol = RTOLS.get(tol, 0.0)
    excess = diff - (atol + rtol * np.abs(np.nan_to_num(expected)))
    worst = int(np.argmax(excess))
    if excess.flat[worst] > 0:
        raise AssertionError(
            f'{_prefix(label)}{tol} (abs {atol}, rel {rtol}) exceeded: '
            f'abs diff {diff.flat[worst]:.3e} at index {worst}, '
            f'actual {actual.flat[worst]!r}, expected {expected.flat[worst]!r}'
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
