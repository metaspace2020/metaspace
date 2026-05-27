import logging

import numpy as np
from cpyMSpec import isotopePattern, InstrumentModel

from sm.engine.isotope_labels import extract_labeled_mass_shift

ISOTOPIC_PEAK_N = 4
SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}

logger = logging.getLogger('api')


class Centroids:
    def __init__(
        self,
        isotope_pattern,
        instrument_model,
        pts_per_mz=None,
        n_peaks=ISOTOPIC_PEAK_N,
        mz_shift=0.0,
    ):
        self._isotope_pattern = isotope_pattern
        self._instrument_model = instrument_model
        self._pts_per_mz = pts_per_mz
        self._n_peaks = n_peaks
        self._mz_shift = mz_shift

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
        # For isotope-labeled compounds, shift all display m/z values by the
        # exact mass of the pure-isotope atoms divided by the charge state.
        display_centr_mzs = centr_mzs + self._mz_shift
        min_mz = min(display_centr_mzs) - 0.25
        max_mz = max(display_centr_mzs) + 0.25
        prof_mzs = np.arange(min_mz, max_mz, 1.0 / self._pts_per_mz)
        # The envelope function is defined in the unlabeled (natural) m/z space.
        # Evaluate it at (display_mz - shift) so the profile curve lines up with the
        # shifted centroids.
        prof_ints = self._envelope(prof_mzs - self._mz_shift)
        nnz_idx = prof_ints > 1e-9
        prof_mzs = prof_mzs[nnz_idx]
        prof_ints = prof_ints[nnz_idx]

        return {
            'mz_grid': {'min_mz': min_mz, 'max_mz': max_mz},
            'theor': {
                'centroid_mzs': display_centr_mzs.tolist(),
                'mzs': prof_mzs.tolist(),
                'ints': (prof_ints * 100.0).tolist(),
            },
        }

    @property
    def empty(self):
        return (not self.mzs) and (not self.ints)


def generate(ion, instr, res_power, at_mz, charge):
    # Isotope-labeled pseudo-elements (e.g. X = pure ¹³C) contribute a fixed
    # mass offset with no isotope spread.  Strip them from the ion formula,
    # compute the natural-isotope pattern for the remaining atoms, then shift
    # every centroid by labeled_mass / |charge|.
    labeled_mass_shift, unlabeled_ion = extract_labeled_mass_shift(ion)

    if labeled_mass_shift and not unlabeled_ion:
        raise ValueError(
            f'{ion}: formula consists entirely of labeled elements; isotope pattern unavailable'
        )

    effective_ion = unlabeled_ion if labeled_mass_shift else ion
    mz_shift = labeled_mass_shift / abs(int(charge)) if labeled_mass_shift else 0.0

    isotopes = isotopePattern(effective_ion)
    isotopes.addCharge(int(charge))
    instrument = InstrumentModel(instr, float(res_power), float(at_mz))
    centroids = Centroids(isotopes, instrument, mz_shift=mz_shift)
    return centroids.spectrum_chart()
