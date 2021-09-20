from collections import defaultdict

import numpy as np
import pandas as pd
from msi_recal.math import (
    peak_width,
    ppm_to_sigma_1,
    mass_accuracy_bounds,
    mass_accuracy_bound_indices,
)

from msi_recal import RecalParams
from msi_recal.db_peak_match import get_db_hits
from msi_recal.mean_spectrum import hybrid_mean_spectrum, sample_across_mass_range


class EvalPeaksCollector:
    def __init__(self, sample_peaks_df, params: RecalParams):
        self.params = params
        mean_spectrum = hybrid_mean_spectrum(
            sample_peaks_df, params.analyzer, params.peak_width_sigma_1 + params.jitter_sigma_1, 0
        )
        db_hits = get_db_hits(mean_spectrum, params, params.jitter_sigma_1)
        eval_peaks = (
            db_hits[(db_hits.weight > 0) & (db_hits.n_hits > 2)]
            .sort_values("weight", ascending=False)
            .drop_duplicates("mz")
            .sort_values("mz")
        )
        eval_peaks = sample_across_mass_range(eval_peaks, eval_peaks.weight, 4, 25)
        eval_peaks = (
            eval_peaks.drop(columns={'mz', 'mz_stddev', 'mz_mx', 'ints', 'ints_stddev', 'ints_mx'})
            .reset_index(drop=True)
            .rename_axis(index='mol_idx')
        )

        self.eval_peaks = eval_peaks
        self._mz_lo, self._mz_hi = mass_accuracy_bounds(
            self.eval_peaks.db_mz, params.analyzer, params.jitter_sigma_1 * 10
        )
        self.ppm_sigma_1 = ppm_to_sigma_1(1, params.analyzer, params.base_mz)
        self.collected_peak_sets = defaultdict(lambda: defaultdict(list))

    def collect_peaks(self, peaks_df, set_name: str = None):
        if not peaks_df.mz.is_monotonic_increasing:
            peaks_df = peaks_df.sort_values('mz')
        lower_idx = np.searchsorted(peaks_df.mz.values, self._mz_lo, "l")
        upper_idx = np.searchsorted(peaks_df.mz.values, self._mz_hi, "r")

        for mol_idx, (lo_idx, hi_idx) in enumerate(zip(lower_idx, upper_idx)):
            peaks_in_range = peaks_df.iloc[lo_idx:hi_idx]
            self.collected_peak_sets[set_name][mol_idx].append(peaks_in_range)

    def reset(self):
        self.collected_peak_sets = defaultdict(lambda: defaultdict(list))

    def get_stats(self, set_name=None):
        peaks_dict = self.collected_peak_sets.get(set_name, {})
        stats = []

        for mol_idx, dfs in peaks_dict.items():
            peak_df = pd.concat(dfs)
            if not len(peak_df):
                continue

            mz_offset = peak_df.mz - self.eval_peaks.at[mol_idx, 'db_mz']
            avg_mz_offset = np.average(mz_offset, weights=peak_df.ints)
            width = peak_width(peak_df.mz.iloc[0], self.params.analyzer, self.ppm_sigma_1)
            avg_ppm_offset = avg_mz_offset / width
            mz_lo, mz_hi = np.percentile(mz_offset, [5, 95])
            stats.append(
                {
                    'mol_idx': mol_idx,
                    'mz_offset': avg_mz_offset,
                    'ppm_offset': avg_ppm_offset,
                    'mz_spread': mz_hi - mz_lo,
                    'ppm_spread': (mz_hi - mz_lo) / width,
                    'in_1ppm': np.count_nonzero(np.abs(mz_offset) <= 1 * width) / len(peak_df),
                    'in_2ppm': np.count_nonzero(np.abs(mz_offset) <= 2 * width) / len(peak_df),
                    'in_3ppm': np.count_nonzero(np.abs(mz_offset) <= 3 * width) / len(peak_df),
                    'n_spectra': len(peak_df),
                }
            )

        return pd.DataFrame(stats).set_index('mol_idx')

    def get_report(self):
        report_df = self.eval_peaks
        for set_name, peaks_dict in self.collected_peak_sets.items():
            stats = self.get_stats(set_name)
            if set_name:
                stats = stats.add_prefix(f'{set_name}_')
            report_df = report_df.join(stats, how='left')

        return report_df
