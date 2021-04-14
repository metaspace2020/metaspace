import logging

import msiwarp as mx
import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mx_peaks

from msi_recal.math import peak_width
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


class AlignMsiwarp:
    def __init__(self, params: RecalParams):
        self.align_sigma_1 = params.align_sigma_1
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument
        self.n_mx_align_steps = params.n_mx_align_steps
        self.coef_ = {}
        self.lo_warp_ = {}
        self.hi_warp_ = {}
        self.ref_s = None
        self.align_nodes = None

    def fit(self, X, y):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'
        missing_cols = {'mz', 'ints'}.difference(y.columns)
        assert not missing_cols, f'y is missing columns: {", ".join(missing_cols)}'
        y = y.sort_values('mz')

        # To ensure an even distribution of peaks across the mass range, take up to 250 peaks
        # from each quadrant of the mass range
        bin_edges = np.histogram_bin_edges(y.mz.values, 4)
        ref_chunks = []
        print()
        for i in range(4):
            range_peaks = y[y.mz.between(bin_edges[i], bin_edges[i + 1])]
            idxs = np.argsort(-range_peaks.ints.values)[:250]
            logger.debug(
                f'Chose {len(idxs)} peaks from {bin_edges[i]:.0f}-{bin_edges[i+1]:.0f} for alignment'
            )
            ref_chunks.append(range_peaks.iloc[idxs])
        ref_df = pd.concat(ref_chunks)

        node_mzs = np.array([np.floor(X.mz.min()), np.ceil(X.mz.max())])
        node_slacks = peak_width(node_mzs, self.instrument, self.align_sigma_1) / 2
        self.ref_s = to_mx_peaks(
            ref_df.mz, ref_df.ints, self.jitter_sigma_1, 1000000, self.instrument
        )
        logger.info(f'Selected {len(self.ref_s)} peaks for alignment')

        # Include immovable nodes at 0 and 10000 Da because MSIWarp throws away peaks outside of
        # the range of these nodes, which can be annoying when it was fitted against a bad set of
        # sample spectra
        self.align_nodes = [
            *mx.initialize_nodes([0], [0], 1),
            *mx.initialize_nodes(node_mzs, node_slacks, self.n_mx_align_steps),
            *mx.initialize_nodes([10000], [0], 1),
        ]

        return self

    def predict(self, X):
        assert self.ref_s is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        spectra = [
            to_mx_peaks(grp_sorted.mz, grp_sorted.ints, self.jitter_sigma_1, sp, self.instrument)
            for sp, grp in X.groupby('sp')
            for grp_sorted in [grp.sort_values('mz')]
        ]
        # Calculate alignments for spectra that haven't been seen yet
        spectra_to_calc = [s for s in spectra if s[0].id not in self.coef_]
        if spectra_to_calc:
            epsilon = self.align_sigma_1 / self.jitter_sigma_1
            align_moves = mx.find_optimal_spectra_warpings(
                spectra_to_calc, self.ref_s, self.align_nodes, epsilon
            )
            for spectrum, align_move in zip(spectra_to_calc, align_moves):
                sp = spectrum[0].id
                self.coef_[sp] = align_move
                self.lo_warp_[sp] = (
                    self.align_nodes[0].mz + self.align_nodes[0].mz_shifts[align_move[0]]
                )
                self.hi_warp_[sp] = (
                    self.align_nodes[1].mz + self.align_nodes[1].mz_shifts[align_move[1]]
                )

        # Apply alignments & convert back to
        results_dfs = []
        for spectrum in spectra:
            sp = spectrum[0].id
            align_move = self.coef_[sp]
            aligned_spectrum = mx.warp_peaks(spectrum, self.align_nodes, align_move)
            results_dfs.append(
                pd.DataFrame(
                    {
                        'sp': sp,
                        'mz': [p.mz for p in aligned_spectrum],
                        'ints': [p.height for p in aligned_spectrum],
                    }
                )
            )

        return pd.concat(results_dfs)
