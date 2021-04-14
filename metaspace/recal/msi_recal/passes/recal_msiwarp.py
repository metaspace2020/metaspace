import logging

import msiwarp as mx
import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mx_peaks

from msi_recal.math import peak_width
from msi_recal.mean_spectrum import (
    get_mean_mx_spectrum_parallel,
    get_representative_spectrum,
    hybrid_mean_spectrum,
)
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


class RecalMsiwarp:
    def __init__(self, params: RecalParams):
        self.params = params
        self.mx_recal_sigma_1 = params.mx_recal_sigma_1
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument

        self.coef_ = {}
        self.lo_warp_ = {}
        self.hi_warp_ = {}

        self.recal_nodes = None
        self.recal_move = None

    def fit(self, X, y):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'
        missing_cols = {'mz', 'ints'}.difference(y.columns)
        assert not missing_cols, f'y is missing columns: {", ".join(missing_cols)}'

        self.recal_nodes = self._make_recal_nodes(np.floor(X.mz.min()), np.ceil(X.mz.max()))

        # Convert reference spectrum
        y = y.sort_values('mz')
        ref_s = to_mx_peaks(y.mz, y.ints, self.jitter_sigma_1, 2, self.instrument)

        # Get sample spectrum
        mean_spectrum = hybrid_mean_spectrum(X, self.instrument, self.jitter_sigma_1)
        spectrum = get_representative_spectrum(
            X, mean_spectrum.mz.values, self.instrument, self.jitter_sigma_1
        )
        # Reminder: IDs must be different
        recal_s = to_mx_peaks(spectrum.mz, spectrum.ints, self.jitter_sigma_1, 1, self.instrument)

        logger.info(f'Representative spectrum has {len(recal_s)} peaks')
        logger.info(f'Alignment spectrum has {len(ref_s)} peaks')

        self.recal_move = mx.find_optimal_spectrum_warping(
            recal_s,
            # aligned_mean_spectrum,
            ref_s,
            self.recal_nodes,
            # The "epsilon" parameter is multiplied by a node's sigma to get the maximum distance
            # between peaks for them to be candidate recalibration pairs
            self.mx_recal_sigma_1 / self.jitter_sigma_1,
        )

        for node, move in zip(self.recal_nodes, self.recal_move):
            logger.debug(f'Warping {node.mz:.6f} -> {node.mz + node.mz_shifts[move]:.6f}')

        return self

    def _make_recal_nodes(self, min_mz, max_mz):
        node_mzs = np.round(np.linspace(min_mz, max_mz, self.params.n_mx_recal_segms + 1))
        node_slacks = peak_width(node_mzs, self.instrument, self.mx_recal_sigma_1) / 2
        # Include immovable nodes at 0 and 10000 Da because MSIWarp throws away peaks outside of
        # the range of these nodes, which can be annoying when it was fitted against a bad set of
        # sample spectra
        recal_nodes = [
            *mx.initialize_nodes([0], [0], 1),
            *mx.initialize_nodes(node_mzs, node_slacks, self.params.n_mx_recal_steps),
            *mx.initialize_nodes([10000], [0], 1),
        ]
        return recal_nodes

    def predict(self, X):
        assert self.recal_move is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        # Apply alignments & convert back to
        results_dfs = []
        for sp, grp in X.groupby('sp'):
            if not grp.mz.is_monotonic_increasing:
                grp = grp.sort_values('mz')

            recal_spectrum = mx.warp_peaks(
                to_mx_peaks(grp.mz, grp.ints, self.jitter_sigma_1, sp, self.instrument),
                self.recal_nodes,
                self.recal_move,
            )
            results_dfs.append(
                pd.DataFrame(
                    {
                        'sp': sp,
                        'mz': [p.mz for p in recal_spectrum],
                        'ints': [p.height for p in recal_spectrum],
                    }
                )
            )

        results_df = pd.concat(results_dfs)
        return results_df
