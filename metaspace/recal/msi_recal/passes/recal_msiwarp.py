import logging

import matplotlib.pyplot as plt
import msiwarp as mx
import numpy as np
import pandas as pd
import seaborn as sns
from matplotlib.figure import Figure
from msiwarp.util.warp import to_mx_peaks

from msi_recal.db_peak_match import get_recal_candidates
from msi_recal.math import peak_width, ppm_to_sigma_1
from msi_recal.mean_spectrum import representative_spectrum
from msi_recal.params import RecalParams
from msi_recal.plot import save_recal_image

logger = logging.getLogger(__name__)


class RecalMsiwarp:
    def __init__(self, params: RecalParams, ppm='20', segments='4', precision='0.1'):
        self.params = params
        self.recal_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)
        self.n_segments = int(segments)
        self.n_steps = int(np.round(float(ppm) / float(precision)))
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument

        self.recal_spectrum = None
        self.recal_nodes = None
        self.recal_move = None
        self.skip = False

    def fit(self, X):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        self.recal_nodes = self._make_mx_nodes(X)

        # Get reference spectrum
        recal_candidates, self.db_hits, mean_spectrum = get_recal_candidates(
            X, self.params, self.recal_sigma_1
        )
        self.recal_spectrum = to_mx_peaks(
            recal_candidates.mz, recal_candidates.ints, self.jitter_sigma_1, 100, self.instrument
        )

        # Get sample spectrum
        spectrum = representative_spectrum(X, mean_spectrum, self.instrument, self.jitter_sigma_1)
        # Reminder: spectrum IDs must be different!!!
        recal_s = to_mx_peaks(spectrum.mz, spectrum.ints, self.jitter_sigma_1, 5, self.instrument)

        logger.info(f'Representative spectrum has {len(recal_s)} peaks')
        logger.info(f'Calibration spectrum has {len(self.recal_spectrum)} peaks')

        self.recal_move = mx.find_optimal_spectrum_warping(
            recal_s,
            # aligned_mean_spectrum,
            self.recal_spectrum,
            self.recal_nodes,
            # The "epsilon" parameter is multiplied by a node's sigma to get the maximum distance
            # between peaks for them to be candidate recalibration pairs
            self.recal_sigma_1 / self.jitter_sigma_1,
        )

        if all(
            move in (0, len(node.mz_shifts) - 1)
            for move, node in zip(self.recal_move, self.recal_nodes)
        ):
            logger.warning("MSIWarp produced an invalid warp. Skipping recal_msiwarp.")
            self.skip = True
        else:
            for i, (node, move) in enumerate(zip(self.recal_nodes, self.recal_move)):
                move_str = f'{node.mz:.6f} -> {node.mz + node.mz_shifts[move]:.6f} (node {move} / {len(node.mz_shifts)})'
                if move == 0:
                    logger.warning(
                        f'MSIWarp appears to have made an invalid warp: {move_str}. '
                        f'Overriding it to not shift this node.'
                    )
                    # Reset node to the middle mz_shift as it is usually 0
                    self.recal_move[i] = (len(node.mz_shifts) + 1) // 2
                else:
                    logger.debug(f'Warping {move_str}')

        return self

    def _make_mx_nodes(self, X):
        # MSIWarp discards peaks outside the node_mzs range, so add a safety margin at either end
        # in case some other spectra in the dataset have a wider m/z range than the sample spectra.
        # Also, round to the nearest 10 or 1 Da for consistency and interpretability, and only pick
        # unique values in case n_segments is too high or the mass range is too small
        min_mz = np.floor(X.mz.min() / 10 - 1) * 10
        max_mz = np.ceil(X.mz.max() / 10 + 1) * 10
        node_mzs = np.unique(np.round(np.linspace(min_mz, max_mz, self.n_segments + 1)))
        node_slacks = peak_width(node_mzs, self.instrument, self.recal_sigma_1) / 2
        return mx.initialize_nodes(node_mzs, node_slacks, self.n_steps)

    def predict(self, X):
        assert self.recal_move is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        if self.skip:
            return X

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

    def save_debug(self, spectra_df, path_prefix):
        self.db_hits.to_csv(f'{path_prefix}_db_hits.csv')

        save_recal_image(
            self.db_hits[lambda df: df.used_for_recal],
            [(n.mz, n.mz_shifts[move]) for n, move in zip(self.recal_nodes, self.recal_move)],
            'MSIWarp recalibration',
            f'{path_prefix}_recal.png',
        )
