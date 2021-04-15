import logging

import msiwarp as mx
import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mx_peaks

from msi_recal.math import peak_width, ppm_to_sigma_1
from msi_recal.mean_spectrum import hybrid_mean_spectrum, representative_spectrum
from msi_recal.params import RecalParams
from msi_recal.save_image_plot import save_spectrum_image

logger = logging.getLogger(__name__)


class AlignMsiwarp:
    def __init__(self, params: RecalParams, ppm='5', segments='1', precision='0.2'):
        self.align_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)
        self.n_segments = int(segments)
        self.n_steps = int(np.round(float(ppm) / float(precision)))

        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument

        self.coef_ = {}
        self.warps_ = [{} for i in range(self.n_segments + 1)]

        self.ref_s = None
        self.align_nodes = None

    def fit(self, X):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        mean_spectrum = hybrid_mean_spectrum(X, self.instrument, self.align_sigma_1)
        spectrum = representative_spectrum(
            X,
            mean_spectrum,
            self.instrument,
            self.align_sigma_1,
            remove_bg=True,
        )

        ref_df = self._sample_across_mass_range(spectrum)

        node_mzs = np.linspace(np.floor(X.mz.min()), np.ceil(X.mz.max()), self.n_segments + 1)
        node_slacks = peak_width(node_mzs, self.instrument, self.align_sigma_1) / 2
        self.ref_s = to_mx_peaks(
            ref_df.mz, ref_df.ints, self.jitter_sigma_1, 1000000, self.instrument
        )
        logger.debug(f'Selected {len(self.ref_s)} peaks for alignment')

        # Include immovable nodes at 0 and 10000 Da because MSIWarp throws away peaks outside of
        # the range of these nodes, which can be annoying when it was fitted against a bad set of
        # sample spectra
        self.align_nodes = [
            *mx.initialize_nodes([0], [0], 1),
            *mx.initialize_nodes(node_mzs, node_slacks, self.n_steps),
            *mx.initialize_nodes([10000], [0], 1),
        ]

        return self

    def _sample_across_mass_range(self, spectrum, n_bins=4, n_per_bin=250):
        # To ensure an even distribution of peaks across the mass range, take the most intense peaks
        # from each quadrant of the mass range
        bin_edges = np.histogram_bin_edges(spectrum.mz.values, n_bins)
        ref_chunks = []
        for i in range(n_bins):
            range_peaks = spectrum[spectrum.mz.between(bin_edges[i], bin_edges[i + 1])]
            idxs = np.argsort(-range_peaks.ints.values)[:n_per_bin]
            logger.debug(
                f'Chose {len(idxs)} alignment peaks from {bin_edges[i]:.0f}-{bin_edges[i + 1]:.0f}'
            )
            ref_chunks.append(range_peaks.iloc[idxs])
        return pd.concat(ref_chunks)

    def predict(self, X):
        assert self.ref_s is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        spectra = [
            to_mx_peaks(grp_sorted.mz, grp_sorted.ints, self.jitter_sigma_1, sp, self.instrument)
            for sp, grp in X.groupby('sp')
            for grp_sorted in [grp.sort_values('mz')]
        ]
        self._calc_alignments(spectra)

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

    def _calc_alignments(self, spectra):
        # Calculate alignments for spectra that haven't been seen yet
        spectra_to_calc = [s for s in spectra if s[0].id not in self.coef_]
        if spectra_to_calc:
            # WORKAROUND: MSIWarp sometimes has issues with small numbers of spectra,
            # due to the calculated number of threads being out of range. Repeat the spectra several
            # times to get up to a stable size.
            # TODO: Report/send patch
            n_spectra = len(spectra_to_calc)
            if n_spectra < 20:
                spectra_to_calc = spectra_to_calc * int(np.ceil(20 / n_spectra))

            epsilon = self.align_sigma_1 / self.jitter_sigma_1
            align_moves = mx.find_optimal_spectra_warpings(
                spectra_to_calc, self.ref_s, self.align_nodes, epsilon
            )
            align_moves = align_moves[:n_spectra]
            for spectrum, align_move in zip(spectra_to_calc, align_moves):
                sp = spectrum[0].id
                self.coef_[sp] = align_move
                for i in range(self.n_segments + 1):
                    self.warps_[i][sp] = (
                        self.align_nodes[i + 1].mz
                        + self.align_nodes[i + 1].mz_shifts[align_move[i + 1]]
                    )

    def save_debug(self, spectra_df, path_prefix):
        for i, warp_ in enumerate(self.warps_):
            mz = self.align_nodes[i + 1].mz
            max_val = np.max(np.abs(list(warp_.values())))

            save_spectrum_image(
                spectra_df,
                warp_,
                f'{path_prefix}_{mz:.0f}_shift.png',
                f'm/z shift at {mz:.6f}',
                vmin=-max_val,
                vmax=max_val,
                cmap='Spectral',
            )
