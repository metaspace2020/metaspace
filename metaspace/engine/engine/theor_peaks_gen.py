"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
from os.path import realpath, join, exists
from os import makedirs
from traceback import format_exc

from engine.pyMS.pyisocalc.pyisocalc import complete_isodist, complex_to_simple, SumFormulaParser
from engine.db import DB
from engine.util import logger


db_id_sql = 'SELECT id FROM formula_db WHERE name = %s'
agg_formula_sql = 'SELECT id, sf FROM agg_formula where db_id = %s'
SF_ADDUCT_SEL = ('SELECT sf, adduct FROM theor_peaks p '
                 'JOIN agg_formula f on p.sf_id = f.id and p.db_id = f.db_id '
                 'WHERE p.db_id = %s AND ROUND(sigma::numeric, 4) = %s AND charge = %s AND pts_per_mz = %s')


def slice_array(mzs, lower, upper):
    return np.hstack(map(lambda (l, u): mzs[l:u], zip(lower, upper)))


def list_of_floats_to_str(l):
    return ','.join(map(lambda x: '{:.6f}'.format(x), l))


def valid_sf_adduct(sf, adduct):
    if not sf or not adduct or sf == 'None' or adduct == 'None':
        logger.warning('Wrong arguments for pyisocalc: sf=%s or adduct=%s', sf, adduct)
        return False
    else:
        return True


class IsocalcWrapper(object):

    def __init__(self, isocalc_config):
        self.charge = 0
        if 'polarity' in isocalc_config['charge']:
            polarity = isocalc_config['charge']['polarity']
            self.charge = (-1 if polarity == '-' else 1) * isocalc_config['charge']['n_charges']
        self.sigma = isocalc_config['isocalc_sigma']
        self.pts_per_mz = isocalc_config['isocalc_points_per_mz']

    def _isodist(self, sf_adduct):
        sf_adduct_simplified = complex_to_simple(sf_adduct)
        sf_adduct_obj = SumFormulaParser.parse_string(sf_adduct_simplified)
        return complete_isodist(sf_adduct_obj, sigma=self.sigma, charge=self.charge, pts_per_mz=self.pts_per_mz)

    def _iso_peaks(self, sf, adduct):
        res_dict = {'centr_mzs': [], 'centr_ints': [], 'profile_mzs': [], 'profile_ints': []}
        try:
            isotope_ms = self._isodist(sf + adduct)

            centr_mzs, centr_ints = isotope_ms.get_spectrum(source='centroids')
            res_dict['centr_mzs'] = centr_mzs
            res_dict['centr_ints'] = centr_ints

            profile_mzs, profile_ints = isotope_ms.get_spectrum(source='profile')
            lower = profile_mzs.searchsorted(centr_mzs, 'l') - 3
            upper = profile_mzs.searchsorted(centr_mzs, 'r') + 3
            res_dict['profile_mzs'] = slice_array(profile_mzs, lower, upper)
            res_dict['profile_ints'] = slice_array(profile_ints, lower, upper)
        except (ValueError, TypeError) as e:
            logger.warning('(%s, %s) - %s', sf, adduct, e.message)
        except Exception as e:
            logger.error('(%s, %s) - %s', sf, adduct, e.message)
            logger.error(format_exc())
        finally:
            return res_dict

    def _format_peak_str(self, db_id, sf_id, adduct, peak_dict):
        return '%d\t%d\t%s\t%.4f\t%d\t%d\t{%s}\t{%s}\t{%s}\t{%s}' % (
            db_id, sf_id, adduct,
            self.sigma, self.charge, self.pts_per_mz,
            list_of_floats_to_str(peak_dict['centr_mzs']),
            list_of_floats_to_str(peak_dict['centr_ints']),
            list_of_floats_to_str(peak_dict['profile_mzs']),
            list_of_floats_to_str(peak_dict['profile_ints'])
        )

    def formatted_iso_peaks(self, db_id, sf_id, sf, adduct):
        peak_dict = self._iso_peaks(sf, adduct)
        if np.all([len(v) > 0 for v in peak_dict.values()]):
            yield self._format_peak_str(db_id, sf_id, adduct, peak_dict)


class TheorPeaksGenerator(object):

    def __init__(self, sc, sm_config, ds_config):
        self.sc = sc
        self.sm_config = sm_config
        self.ds_config = ds_config

        self.theor_peaks_tmp_dir = join(sm_config['fs']['data_dir'], 'theor_peaks_gen')
        self.db = DB(sm_config['db'])

        db_name = self.ds_config['inputs']['database']
        self.db_id = self.db.select_one(db_id_sql, db_name)[0]
        self.adducts = self.ds_config['isotope_generation']['adducts']

        self.isocalc_wrapper = IsocalcWrapper(self.ds_config['isotope_generation'])

    def run(self):
        logger.info('Running theoretical peaks generation')
        stored_sf_adduct = self.db.select(SF_ADDUCT_SEL, self.db_id,
                                          self.isocalc_wrapper.sigma,
                                          self.isocalc_wrapper.charge,
                                          self.isocalc_wrapper.pts_per_mz)

        sf_adduct_cand = self.find_sf_adduct_cand(set(stored_sf_adduct))
        sf_adduct_cand = filter(lambda (_, sf, adduct): valid_sf_adduct(sf, adduct), sf_adduct_cand)
        logger.info('%d saved (sf, adduct)s, %s not saved (sf, adduct)s', len(stored_sf_adduct), len(sf_adduct_cand))

        if sf_adduct_cand:
            peak_lines = self.generate_theor_peaks(sf_adduct_cand)
            self._import_theor_peaks_to_db(peak_lines)

    def find_sf_adduct_cand(self, stored_sf_adduct):
        formula_list = self.db.select(agg_formula_sql, self.db_id)
        cand = [sf_row + (adduct,) for sf_row in formula_list for adduct in self.adducts]
        return filter(lambda (sf_id, sf, adduct): (sf, adduct) not in stored_sf_adduct, cand)

    def generate_theor_peaks(self, sf_adduct_cand):
        logger.info('Generating missing peaks')
        formatted_iso_peaks = self.isocalc_wrapper.formatted_iso_peaks
        db_id = self.db_id
        sf_adduct_cand_rdd = self.sc.parallelize(sf_adduct_cand, numSlices=8)
        peak_lines = (sf_adduct_cand_rdd
                      .flatMap(lambda (sf_id, sf, adduct): formatted_iso_peaks(db_id, sf_id, sf, adduct))
                      .collect())
        # for res in map(lambda (sf_id, sf, adduct): formatted_iso_peaks(db_id, sf_id, sf, adduct), sf_adduct_cand):
        #     print list(res)[0]
        return peak_lines
        # return None

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        if not exists(self.theor_peaks_tmp_dir):
            makedirs(self.theor_peaks_tmp_dir)

        peak_lines_path = join(self.theor_peaks_tmp_dir, 'peak_lines.csv')
        with open(peak_lines_path, 'w') as f:
            f.write('\n'.join(peak_lines))

        with open(peak_lines_path) as peaks_file:
            self.db.copy(peaks_file, 'theor_peaks')
