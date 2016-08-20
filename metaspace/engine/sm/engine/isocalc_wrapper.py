from traceback import format_exc
from collections import namedtuple
import numpy as np
from cpyMSpec.legacy_interface import complete_isodist
from pyMSpec.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
import logging


logger = logging.getLogger('sm-engine')

Centroids = namedtuple('Centroids', ['mzs', 'ints'])


def list_of_floats_to_str(l):
    return ','.join(map(lambda x: '{:.6f}'.format(x), l))


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
        self.sigma = isocalc_config['isocalc_sigma']
        self.pts_per_mz = isocalc_config['isocalc_pts_per_mz']
        self.prof_pts_per_centr = 6

    def _isodist(self, sf_adduct):
        sf_adduct_obj = parseSumFormula(sf_adduct)
        return complete_isodist(sf_adduct_obj, sigma=self.sigma, charge=self.charge, pts_per_mz=self.pts_per_mz,
                                centroid_kwargs={'weighted_bins': 5})

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
        : dict
            A dict with keys:
             - centroid mzs
             - centroid intensities
            In case of any errors returns a dict of empty lists.
        """
        centroids = Centroids([], [])
        try:
            isotope_ms = self._isodist(sf + adduct)
            centroids = Centroids(*map(lambda l: l[:6],
                                            isotope_ms.get_spectrum(source='centroids')))
        except InvalidFormulaError as e:
            logger.warning('(%s, %s) - %s', sf, adduct, e)
        except Exception as e:
            logger.error('(%s, %s) - %s', sf, adduct, e)
            logger.error(format_exc())
        finally:
            return centroids

    @staticmethod
    def slice_array(mzs, lower, upper):
        return np.hstack(map(lambda (l, u): mzs[l:u], zip(lower, upper)))

    def _format_peak_str(self, db_id, sf_id, adduct, centroids):
        return '%d\t%d\t%s\t%.6f\t%d\t%d\t{%s}\t{%s}\t{%s}\t{%s}' % (
            db_id, sf_id, adduct,
            round(self.sigma, 6), self.charge, self.pts_per_mz,
            list_of_floats_to_str(centroids.mzs),
            list_of_floats_to_str(centroids.ints),
            '',
            ''
        )

    def formatted_iso_peaks(self, db_id, sf_id, sf, adduct):
        """
        Args
        ----
        db_id : int
            Database id
        sf_id : int
            Sum formula id
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
            yield self._format_peak_str(db_id, sf_id, adduct, centroids)