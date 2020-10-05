from cpyMSpec import isotopePattern, InstrumentModel
from pyMSpec.pyisocalc import pyisocalc
import cpyMSpec.utils
import numpy as np
import logging

assert cpyMSpec.utils.VERSION == '0.3.5', 'Incorrect version of cpyMSpec: ' + cpyMSpec.utils.VERSION

logger = logging.getLogger('engine')

ISOTOPIC_PEAK_N = 4
SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}


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
        self.n_peaks = isocalc_config.get('n_peaks', ISOTOPIC_PEAK_N)
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

    def centroids(self, formula):
        """
        Args
        -----
        formula : str

        Returns
        -----
            list[tuple]
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
