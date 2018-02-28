from cpyMSpec import isotopePattern, InstrumentModel
from pyMSpec.pyisocalc import pyisocalc
import numpy as np
import logging
from collections import namedtuple


logger = logging.getLogger('sm-engine')

ISOTOPIC_PEAK_N = 4
SIGMA_TO_FWHM = 2.3548200450309493  # 2 \sqrt{2 \log 2}


Ion = namedtuple('Ion', 'sf adduct')
Centroids = namedtuple('Centroids', 'mzs ints')
IonCentroids = namedtuple('IonCentroids', 'ion centroids')

EMPTY_CENTROIDS = Centroids(np.array([]), np.array([]))


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

    @staticmethod
    def _trim(centroids, k):
        """ Only keep top k peaks
        """
        int_order = np.argsort(centroids.ints)[::-1]
        mzs = centroids.mzs[int_order][:k]
        ints = centroids.ints[int_order][:k]
        mz_order = np.argsort(mzs)
        mzs = mzs[mz_order]
        ints = ints[mz_order]
        return Centroids(mzs, ints)

    def isotope_peaks(self, ion):
        """
        Args
        ----
        ion : Ion
            Ion

        Returns
        -------
        : Centroids
        """
        try:
            pyisocalc.parseSumFormula(ion.sf + ion.adduct)  # tests is the sf and adduct compatible
            iso_pattern = isotopePattern(str(ion.sf + ion.adduct))
            iso_pattern.addCharge(int(self.charge))
            fwhm = self.sigma * SIGMA_TO_FWHM
            resolving_power = iso_pattern.masses[0] / fwhm
            instrument_model = InstrumentModel('tof', resolving_power)
            centr = iso_pattern.centroids(instrument_model)
            centroids = Centroids(np.array(centr.masses), 100. * np.array(centr.intensities))
            centroids = self._trim(centroids, ISOTOPIC_PEAK_N)
            return centroids
        except Exception as e:
            logger.warning('%s - %s', ion, e)
            return EMPTY_CENTROIDS

    def format_peaks(self, ion_centr):
        """
        Args
        ---
        ion_centr : IonCentroids

        Returns
        ---
        : str
            One line string with tab separated lists. Every list is a comma separated string.
        """
        def list_of_floats_to_str(xs):
            return ','.join('{:.6f}'.format(x) for x in xs)

        ion, centroids = ion_centr
        return '%s\t%s\t%.6f\t%d\t%d\t{%s}\t{%s}' % (
            ion.sf, ion.adduct,
            round(self.sigma, 6), self.charge, self.pts_per_mz,
            list_of_floats_to_str(centroids.mzs),
            list_of_floats_to_str(centroids.ints)
        )
