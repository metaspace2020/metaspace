import logging

import msiwarp as mx
import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mx_peaks

from msi_recal.math import peak_width, ppm_to_sigma_1, mass_accuracy_bounds
from msi_recal.mean_spectrum import (
    hybrid_mean_spectrum,
    representative_spectrum,
    sample_across_mass_range,
)
from msi_recal.params import RecalParams
from msi_recal.plot import save_spectrum_image, save_mma_image

logger = logging.getLogger(__name__)

try:
    from pyMSpec.centroid_detection import gradient
    import scipy.signal as signal
except ImportError:
    gradient = None
    signal = None


class AlignMsiwarp:
    def __init__(self, params: RecalParams, ppm='5', segments='1', precision='0.2'):
        self.params = params
        self.align_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)
        self.n_segments = int(segments)
        self.n_steps = int(np.round(float(ppm) / float(precision)))
        self.profile_mode = params.profile_mode

        self.peak_width_sigma_1 = params.peak_width_sigma_1
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument

        self.coef_ = {}
        self.warps_ = [{} for i in range(self.n_segments + 1)]

        self.ref_s = None
        self.align_nodes = None
        self.sample_mzs = None
        self.sample_mzs_bounds = None
        self.sample_before = None
        self.sample_after = None

        if gradient is None or signal is None:
            logger.debug(
                'Missing optional dependency pyMSpec or scipy. Debug images of peak alignment may be inaccurate'
            )

    def fit(self, X):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        mean_spectrum = hybrid_mean_spectrum(
            X,
            self.instrument,
            max(self.align_sigma_1, self.jitter_sigma_1 + self.peak_width_sigma_1),
        )
        ref_df = representative_spectrum(
            X, mean_spectrum, self.instrument, self.align_sigma_1, denoise=not self.profile_mode,
        )

        if self.profile_mode:
            # Just grab the most intense peaks, otherwise it takes ages to fit each spectrum
            ref_df = sample_across_mass_range(ref_df, ref_df.ints, n_per_bin=1000)

        self.sample_mzs = sample_across_mass_range(
            mean_spectrum, mean_spectrum.coverage.values, n_per_bin=4
        ).mz.values
        self.sample_mzs_bounds = mass_accuracy_bounds(
            self.sample_mzs, self.instrument, self.align_sigma_1
        )
        self.sample_before = [[] for mz in self.sample_mzs]
        self.sample_after = [[] for mz in self.sample_mzs]

        self.align_nodes = self._make_mx_nodes(X)
        self.warps_ = [{} for node in self.align_nodes]

        self.ref_s = to_mx_peaks(
            ref_df.mz, ref_df.ints, self.jitter_sigma_1, 1000000, self.instrument
        )
        logger.debug(f'Selected {len(self.ref_s)} peaks for alignment')

        return self

    def _make_mx_nodes(self, X):
        # MSIWarp discards peaks outside the node_mzs range, so add a safety margin at either end
        # in case some other spectra in the dataset have a wider m/z range than the sample spectra.
        # Also, round to the nearest 10 or 1 Da for consistency and interpretability, and only pick
        # unique values in case n_segments is too high or the mass range is too small
        min_mz = np.floor(X.mz.min() / 10 - 1) * 10
        max_mz = np.ceil(X.mz.max() / 10 + 1) * 10
        node_mzs = np.unique(np.round(np.linspace(min_mz, max_mz, self.n_segments + 1)))
        node_slacks = peak_width(node_mzs, self.instrument, self.align_sigma_1) / 2
        return mx.initialize_nodes(node_mzs, node_slacks, self.n_steps)

    def predict(self, X):
        assert self.ref_s is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        spectra = [(sp, grp.sort_values('mz')) for sp, grp in X.groupby('sp')]
        mx_spectra = [
            to_mx_peaks(grp.mz, grp.ints, self.jitter_sigma_1, sp, self.instrument)
            for sp, grp in spectra
        ]
        self._calc_alignments(mx_spectra)

        # Apply alignments & convert back to dataframe format
        results_dfs = []
        for (sp, spectrum), mx_spectrum in zip(spectra, mx_spectra):
            align_move = self.coef_[sp]
            aligned_spectrum = mx.warp_peaks(mx_spectrum, self.align_nodes, align_move)
            result_df = pd.DataFrame(
                {
                    'sp': sp,
                    'mz': [p.mz for p in aligned_spectrum],
                    'ints': [p.height for p in aligned_spectrum],
                }
            )
            results_dfs.append(result_df)

            # Add spectra to sample images
            self._add_to_sample_images(sp, spectrum, self.sample_before)
            self._add_to_sample_images(sp, result_df, self.sample_after)

        return pd.concat(results_dfs)

    def _add_to_sample_images(self, sp, spectrum, image_set):
        if len(self.sample_mzs):
            idx_lo = np.searchsorted(spectrum.mz, self.sample_mzs_bounds[0], 'left')
            idx_hi = np.searchsorted(spectrum.mz, self.sample_mzs_bounds[1], 'right')
            for i, (lo, hi) in enumerate(zip(idx_lo, idx_hi)):
                if hi - lo == 0:
                    continue
                elif self.profile_mode and hi - lo > 1:
                    image_set[i].extend(
                        find_centroid_mzs(spectrum.mz.values[lo:hi], spectrum.ints.values[lo:hi])
                    )
                else:
                    image_set[i].extend(spectrum.mz.values[lo:hi])

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
                if all(
                    move == len(node.mz_shifts) - 1
                    for move, node in zip(align_move, self.align_nodes)
                ):
                    logger.warning(
                        f'MSIWarp produced an invalid warp for spectrum {sp}. Skipping alignment.'
                    )
                    self.coef_[sp] = [(len(node.mz_shifts) + 1) // 2 for node in self.align_nodes]
                    for warp, node, move in zip(self.warps_, self.align_nodes, align_move):
                        warp[sp] = 0
                else:
                    self.coef_[sp] = align_move
                    for warp, node, move in zip(self.warps_, self.align_nodes, align_move):
                        warp[sp] = node.mz_shifts[move]

            for i, node in enumerate(self.align_nodes):
                mz = node.mz
                mz_shifts = [node.mz_shifts[move[i]] for move in align_moves]
                min_shift = mz + np.min(mz_shifts)
                max_shift = mz + np.max(mz_shifts)
                logger.debug(f'Aligning {mz:.6f} -> {min_shift :.6f} - {max_shift :.6f}')

    def save_debug(self, spectra_df, path_prefix):
        debug_warps = [(node.mz, warp_) for node, warp_ in zip(self.align_nodes, self.warps_)]
        if len(debug_warps) == 2:
            (lo_mz, lo_warp), (hi_mz, hi_warp) = debug_warps
            mid_mz = (lo_mz + hi_mz) / 2
            common_sps = {*lo_warp.keys()}.intersection(hi_warp.keys())
            mid_warp = {sp: (lo_warp[sp] + hi_warp[sp]) for sp in common_sps}
            debug_warps.insert(1, (mid_mz, mid_warp,))

        for mz, warp in debug_warps:
            max_val = np.max(np.abs(list(warp.values())))

            save_spectrum_image(
                spectra_df,
                warp,
                f'{path_prefix}_shift_{mz:.0f}.png',
                f'm/z adjustment at {mz:.6f}',
                vmin=-max_val,
                vmax=max_val,
                cmap='Spectral',
            )

        for mz, mz_lo, mz_hi, before, after in zip(
            self.sample_mzs, *self.sample_mzs_bounds, self.sample_before, self.sample_after
        ):
            if len(before) > 2 and len(after) > 2:
                save_mma_image(
                    mz,
                    self.params,
                    self.align_sigma_1,
                    before,
                    after,
                    f'{path_prefix}_peak_dist_{mz:.6f}.png',
                )


def find_centroid_mzs(mzs, ints):
    try:
        if len(mzs <= 2):
            # If there aren't enough peaks to model a centroid, assume the centroid is
            # outside of the sampled range and return nothing.
            return np.empty(0)

        if signal is not None and gradient is not None:
            ints = signal.savgol_filter(ints, 5, 2)
            mzs, ints, _ = gradient(
                np.asarray(mzs),
                np.asarray(ints),
                max_output=-1,
                weighted_bins=max(min(3, (len(mzs) - 1) // 2), 1),
            )
            return mzs
    except ValueError:
        return np.empty(0)
