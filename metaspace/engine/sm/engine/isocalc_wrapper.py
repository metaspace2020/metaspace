from cpyMSpec import isotopePattern, InstrumentModel
from pyMSpec.pyisocalc import pyisocalc
import numpy as np
import logging
from collections import namedtuple


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

    def ion_centroids(self, sf, adduct):
        """
        Args
        ----
        sf : str
        adduct: str

        Returns
        -------
        : list of tuples
        """
        try:
            pyisocalc.parseSumFormula(sf + adduct)  # tests is the sf and adduct compatible
            iso_pattern = isotopePattern(str(sf + adduct))
            iso_pattern.addCharge(int(self.charge))
            fwhm = self.sigma * SIGMA_TO_FWHM
            resolving_power = iso_pattern.masses[0] / fwhm
            instrument_model = InstrumentModel('tof', resolving_power)
            centr = iso_pattern.centroids(instrument_model)
            mzs = np.array(centr.masses)
            ints = 100. * np.array(centr.intensities)
            mzs, ints = self._trim(mzs, ints, ISOTOPIC_PEAK_N)
            return mzs, ints

        except Exception as e:
            logger.warning('%s %s - %s', sf, adduct, e)
            return None, None
