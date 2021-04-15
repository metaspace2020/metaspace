import numpy as np
import pandas as pd

from msi_recal.math import mass_accuracy_bounds


def join_by_mz(left, left_mz_col, right, right_mz_col, instrument, sigma_1, how='inner'):
    """Joins two DataFrames by m/z value, using the given m/z tolerance"""

    if not right[right_mz_col].is_monotonic_increasing:
        right = right.sort_values(right_mz_col)
    min_mz, max_mz = mass_accuracy_bounds(left[left_mz_col].values, instrument, sigma_1)

    lo_idx = np.searchsorted(right[right_mz_col], min_mz, 'l')
    hi_idx = np.searchsorted(right[right_mz_col], max_mz, 'r')
    mask = lo_idx != hi_idx

    joiner = pd.DataFrame(
        [
            (left_i, right_i)
            for left_i, lo, hi in zip(left.index[mask], lo_idx[mask], hi_idx[mask])
            for right_i in range(lo, hi)
        ],
        columns=['left_i', 'right_i'],
    )

    return (
        left.merge(joiner, left_index=True, right_on='left_i', how=how)
        .merge(right, left_on='right_i', right_index=True, how=how)
        .drop(columns=['left_i', 'right_i'])
    )
