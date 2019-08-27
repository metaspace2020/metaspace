from cpyMSpec import isotopePattern, InstrumentModel
from pyMSpec.pyisocalc import pyisocalc
import numpy as np
import logging


logger = logging.getLogger('engine')

SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}

_centroids_cache = None


def set_centroids_cache_enabled(enabled):
    """ Turns on/off the centroids cache. This cache can become a massive memory leak if permanently left active.
    It should only be used for batch processing jobs """
    global _centroids_cache
    if enabled and not _centroids_cache:
        _centroids_cache = dict()
    else:
        _centroids_cache = None


class IsocalcWrapper(object):
    """ Wrapper around pyMSpec.pyisocalc.pyisocalc used for getting theoretical isotope peaks'
    centroids and profiles for a sum formula.

    Args
    ----------
    isocalc_config : dict
        Dictionary representing isotope_generation section of a dataset config file
    """

    def __init__(self, isocalc_config):
        self.charge = isocalc_config['charge']
        self.sigma = float(isocalc_config['isocalc_sigma'])
        self.n_peaks = isocalc_config['n_peaks']
        # self.pts_per_mz = int(isocalc_config['isocalc_pts_per_mz'])

    @staticmethod
    def _trim(mzs, ints, k):
        """ Only keep top k peaks
        """
        int_order = np.argsort(ints)[::-1]
        mzs = mzs[int_order][:k]
        ints = ints[int_order][:k]
        mz_order = np.argsort(mzs)
        mzs = mzs[mz_order]
        ints = ints[mz_order]
        return mzs, ints

    def _centroids_uncached(self, formula):
        """
        Args
        -----
        formula : str

        Returns
        -----
            Tuple[np.ndarray, np.ndarray]
        """
        try:
            pyisocalc.parseSumFormula(formula)  # tests that formula is parsable
            iso_pattern = isotopePattern(str(formula))
            iso_pattern.addCharge(int(self.charge))
            fwhm = self.sigma * SIGMA_TO_FWHM
            resolving_power = iso_pattern.masses[0] / fwhm
            instrument_model = InstrumentModel('tof', resolving_power)
            centr = iso_pattern.centroids(instrument_model)
            mzs_ = np.array(centr.masses)
            ints_ = 100.0 * np.array(centr.intensities)
            mzs_, ints_ = self._trim(mzs_, ints_, self.n_peaks)

            n = len(mzs_)
            mzs = np.zeros(self.n_peaks)
            mzs[:n] = np.array(mzs_)
            ints = np.zeros(self.n_peaks)
            ints[:n] = ints_

            return mzs, ints

        except Exception as e:
            logger.warning('%s - %s', formula, e)
            return None, None

    def centroids(self, formula):
        if _centroids_cache is not None:
            cache_key = (formula, self.charge, self.sigma, self.n_peaks)
            result = _centroids_cache.get(cache_key)
            if not result:
                result = self._centroids_uncached(formula)
                _centroids_cache[cache_key] = result
            return result
        else:
            return self._centroids_uncached(formula)
