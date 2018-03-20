from cpyMSpec import isotopePattern, InstrumentModel
from pyMSpec.pyisocalc import pyisocalc
import numpy as np
import logging

logger = logging.getLogger('engine')

ISOTOPIC_PEAK_N = 4
SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}


def trim_centroids(mzs, intensities, k):
    int_order = np.argsort(intensities)[::-1]
    mzs = mzs[int_order][:k]
    intensities = intensities[int_order][:k]
    mz_order = np.argsort(mzs)
    return mzs[mz_order], intensities[mz_order]


class Centroids(object):
    def __init__(self, isotope_pattern, instrument_model, pts_per_mz=None):
        self._isotope_pattern = isotope_pattern
        self._instrument_model = instrument_model
        self._pts_per_mz = pts_per_mz

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
    def empty(self):
        return (not self.mzs) and (not self.ints)


def list_of_floats_to_str(xs):
    return ','.join('{:.6f}'.format(x) for x in xs)


class IsocalcWrapper(object):
    """ Wrapper around pyMSpec.pyisocalc.pyisocalc used for getting theoretical isotope peaks'
    centroids and profiles for a sum formula.

    Args
    ----------
    isocalc_config : dict
        Dictionary representing isotope_generation section of a dataset config file
    """

    def __init__(self, isocalc_config):
        self.charge = 0
        if 'polarity' in isocalc_config['charge']:
            polarity = isocalc_config['charge']['polarity']
            self.charge = (-1 if polarity == '-' else 1) * isocalc_config['charge']['n_charges']
        self.sigma = float(isocalc_config['isocalc_sigma'])
        self.pts_per_mz = int(isocalc_config['isocalc_pts_per_mz'])

    def isotope_peaks(self, sf, adduct):
        """
        Args
        ----
        sf : str
            Sum formula
        adduct : str
            Molecule adduct. One of isotope_generation.adducts from a dataset config file

        Returns
        -------
        : Centroids
            In case of any errors returns object with empty 'mzs' and 'ints' fields
        """
        try:
            pyisocalc.parseSumFormula(sf + adduct)  # tests is the sf and adduct compatible
            isotopes = isotopePattern(str(sf + adduct))
            isotopes.addCharge(int(self.charge))
            fwhm = self.sigma * SIGMA_TO_FWHM
            resolving_power = isotopes.masses[0] / fwhm
            instrument_model = InstrumentModel('tof', resolving_power)
            return Centroids(isotopes, instrument_model, self.pts_per_mz)
        except Exception as e:
            logger.warning('(%s, %s) - %s', sf, adduct, e)
            return Centroids(None, None)

    @staticmethod
    def slice_array(mzs, lower, upper):
        return np.hstack([mzs[l:u] for l, u in zip(lower, upper)])

    def _format_peak_str(self, sf, adduct, centroids):
        # store only top 4 peaks in the database
        mzs, ints = trim_centroids(centroids.mzs, centroids.ints, ISOTOPIC_PEAK_N)
        return '%s\t%s\t%.6f\t%d\t%d\t{%s}\t{%s}' % (
            sf, adduct,
            round(self.sigma, 6), self.charge, self.pts_per_mz,
            list_of_floats_to_str(mzs),
            list_of_floats_to_str(ints)
        )

    def formatted_iso_peaks(self, sf, adduct):
        """
        Args
        ----
        sf : str
            Sum formula
        adduct : str
            Sum formula adduct

        Returns
        -------
        : str
            A one line string with tab separated lists. Every list is a comma separated string.
        """

        centroids = self.isotope_peaks(sf, adduct)
        if len(centroids.mzs) > 0:
            yield self._format_peak_str(sf, adduct, centroids)
