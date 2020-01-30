import logging

import numpy as np
from cpyMSpec import isotopePattern, InstrumentModel

ISOTOPIC_PEAK_N = 4
SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}

logger = logging.getLogger('api')


class Centroids:
    def __init__(self, isotope_pattern, instrument_model, pts_per_mz=None, n_peaks=ISOTOPIC_PEAK_N):
        self._isotope_pattern = isotope_pattern
        self._instrument_model = instrument_model
        self._pts_per_mz = pts_per_mz
        self._n_peaks = n_peaks

        if isotope_pattern is not None:
            centroids = isotope_pattern.centroids(instrument_model)
            order = np.argsort(centroids.masses)
            self.mzs = np.array(centroids.masses)[order]
            self.ints = 100.0 * np.array(centroids.intensities)[order]

            if pts_per_mz is None:
                fwhm = self.mzs[0] / instrument_model.resolvingPowerAt(self.mzs[0])
                sigma = fwhm / SIGMA_TO_FWHM
                self._pts_per_mz = 5.0 / sigma
        else:
            self.mzs = self.ints = []

    @property
    def _envelope(self):
        return self._isotope_pattern.envelope(self._instrument_model)

    @staticmethod
    def _trim_centroids(mzs, intensities, k):
        int_order = np.argsort(intensities)[::-1]
        mzs = mzs[int_order][:k]
        intensities = intensities[int_order][:k]
        mz_order = np.argsort(mzs)
        return mzs[mz_order], intensities[mz_order]

    def spectrum_chart(self):
        centr_mzs, _ = self._trim_centroids(self.mzs, self.ints, self._n_peaks)
        min_mz = min(centr_mzs) - 0.25
        max_mz = max(centr_mzs) + 0.25
        prof_mzs = np.arange(min_mz, max_mz, 1.0 / self._pts_per_mz)
        prof_ints = self._envelope(prof_mzs)
        nnz_idx = prof_ints > 1e-9
        prof_mzs = prof_mzs[nnz_idx]
        prof_ints = prof_ints[nnz_idx]

        return {
            'mz_grid': {'min_mz': min_mz, 'max_mz': max_mz},
            'theor': {
                'centroid_mzs': centr_mzs.tolist(),
                'mzs': prof_mzs.tolist(),
                'ints': (prof_ints * 100.0).tolist(),
            },
        }

    @property
    def empty(self):
        return (not self.mzs) and (not self.ints)


def generate(ion, instr, res_power, at_mz, charge):
    isotopes = isotopePattern(ion)
    isotopes.addCharge(int(charge))
    instrument = InstrumentModel(instr, float(res_power), float(at_mz))
    centroids = Centroids(isotopes, instrument)
    return centroids.spectrum_chart()
