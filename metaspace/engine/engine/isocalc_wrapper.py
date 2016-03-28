from traceback import format_exc
import numpy as np

from engine.util import logger
from pyMS.pyisocalc.canopy.sum_formula_actions import InvalidFormulaError, ParseError
from pyMS.pyisocalc.pyisocalc import parseSumFormula
from cpyMSpec.legacy_interface import complete_isodist


def list_of_floats_to_str(l):
    return ','.join(map(lambda x: '{:.6f}'.format(x), l))


class IsocalcWrapper(object):
    """ Wrapper around pyMS.pyisocalc.pyisocalc used for getting theoretical isotope peaks'
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
        self.max_mz_dist_to_centr = 0.15

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
             - profile mzs
             - profile intensities
            In case of any errors returns a dict of empty lists.
        """
        res_dict = {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}
        try:
            isotope_ms = self._isodist(sf + adduct)

            centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
            res_dict['centr_mzs'] = centr_mzs
            res_dict['centr_ints'] = centr_ints

            profile_mzs, profile_ints = isotope_ms.get_spectrum(source='profile')
            res_dict['profile_mzs'], res_dict['profile_ints'] = \
                self._sample_profiles(centr_mzs, profile_mzs, profile_ints)
        except (InvalidFormulaError, ParseError) as e:
            logger.warning('(%s, %s) - %s', sf, adduct, e)
        except Exception as e:
            logger.error('(%s, %s) - %s', sf, adduct, e)
            logger.error(format_exc())
        finally:
            return res_dict

    @staticmethod
    def slice_array(mzs, lower, upper):
        return np.hstack(map(lambda (l, u): mzs[l:u], zip(lower, upper)))

    def _sample_profiles(self, centr_mzs, profile_mzs, profile_ints):
        sampled_prof_mz_list, sampled_prof_int_list = [], []

        for cmz in centr_mzs:
            centr_mask = np.abs(profile_mzs - cmz) <= self.max_mz_dist_to_centr
            sample_step = max(1, len(profile_mzs[centr_mask]) / self.prof_pts_per_centr)

            # take only N mz points for each centroid
            sampled_prof_mz_list.append(profile_mzs[centr_mask][::sample_step])
            sampled_prof_int_list.append(profile_ints[centr_mask][::sample_step])

        return np.hstack(sampled_prof_mz_list), np.hstack(sampled_prof_int_list)

    def _format_peak_str(self, db_id, sf_id, adduct, peak_dict):
        return '%d\t%d\t%s\t%.6f\t%d\t%d\t{%s}\t{%s}\t{%s}\t{%s}' % (
            db_id, sf_id, adduct,
            round(self.sigma, 6), self.charge, self.pts_per_mz,
            list_of_floats_to_str(peak_dict['centr_mzs']),
            list_of_floats_to_str(peak_dict['centr_ints']),
            list_of_floats_to_str(peak_dict['profile_mzs']),
            list_of_floats_to_str(peak_dict['profile_ints'])
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
        peak_dict = self.isotope_peaks(sf, adduct)
        if np.all([len(v) > 0 for v in peak_dict.values()]):
            yield self._format_peak_str(db_id, sf_id, adduct, peak_dict)