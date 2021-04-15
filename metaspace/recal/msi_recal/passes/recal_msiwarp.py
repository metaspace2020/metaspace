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

logger = logging.getLogger(__name__)


class RecalMsiwarp:
    def __init__(self, params: RecalParams, ppm='20', segments='4', precision='0.1'):
        self.params = params
        self.recal_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)
        self.n_segments = int(segments)
        self.n_steps = int(np.round(float(ppm) / float(precision)))
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument

        self.coef_ = {}
        self.lo_warp_ = {}
        self.hi_warp_ = {}

        self.recal_spectrum = None
        self.recal_nodes = None
        self.recal_move = None
        self.skip = False

    def fit(self, X):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        self.recal_nodes = self._make_recal_nodes(np.floor(X.mz.min()), np.ceil(X.mz.max()))

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
            move == len(node.mz_shifts) - 1 for move, node in zip(self.recal_move, self.recal_nodes)
        ):
            logger.warning("MSIWarp produced an invalid warp. Skipping recal_msiwarp.")
            self.skip = True

        for node, move in zip(self.recal_nodes, self.recal_move):
            logger.debug(f'Warping {node.mz:.6f} -> {node.mz + node.mz_shifts[move]:.6f}')

        return self

    def _make_recal_nodes(self, min_mz, max_mz):
        node_mzs = np.round(np.linspace(min_mz, max_mz, self.n_segments + 1))
        node_slacks = peak_width(node_mzs, self.instrument, self.recal_sigma_1) / 2
        # Include immovable nodes at 0 and 10000 Da because MSIWarp throws away peaks outside of
        # the range of these nodes, which can be annoying when it was fitted against a bad set of
        # sample spectra
        recal_nodes = [
            *mx.initialize_nodes([0], [0], 1),
            *mx.initialize_nodes(node_mzs, node_slacks, self.n_steps),
            *mx.initialize_nodes([10000], [0], 1),
        ]
        return recal_nodes

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

        fig: Figure = plt.figure(figsize=(10, 10))
        fig.suptitle('MSIWarp recalibration')
        ax = fig.gca()

        candidates = self.db_hits[lambda df: df.used_for_recal].copy()
        candidates['mz_err'] = candidates.mz - candidates.db_mz
        sns.scatterplot(
            data=candidates,
            x='mz',
            y='mz_err',
            size='weight',
            hue='db',
            alpha=0.5,
            sizes=(0, 25),
            legend=True,
            ax=ax,
        )
        ax.plot(
            [n.mz for n in self.recal_nodes[1:-1]],
            [n.mz_shifts[move] for n, move in zip(self.recal_nodes[1:-1], self.recal_move[1:-1])],
            label='Recalibration shift',
        )

        fig.savefig(f'{path_prefix}_recal.png')
