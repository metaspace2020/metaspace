"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
from os.path import realpath, join, exists
from os import makedirs
import logging
from traceback import format_exc

from engine.pyMS.pyisocalc.pyisocalc import complete_isodist, complex_to_simple, SumFormulaParser
from engine.db import DB


db_id_sql = 'SELECT id FROM formula_db WHERE name = %s'
agg_formula_sql = 'SELECT id, sf FROM agg_formula where db_id = %s'
sf_id_sf_adduct_sql = ('SELECT sf_id, sf, adduct FROM theor_peaks p '
                       'JOIN agg_formula f on p.sf_id = f.id and p.db_id = f.db_id '
                       'WHERE p.db_id = %s')


logger = logging.getLogger('SM')


def slice_array(mzs, lower, upper):
    return np.hstack(map(lambda (l, u): mzs[l:u], zip(lower, upper)))


class IsocalcWrapper(object):

    def __init__(self, isocalc_config):
        self.charge = 0
        if 'polarity' in isocalc_config['charge']:
            polarity = isocalc_config['charge']['polarity']
            self.charge = (-1 if polarity == '-' else 1) * isocalc_config['charge']['n_charges']
        self.sigma = isocalc_config['isocalc_sigma']
        self.points_per_mz = isocalc_config['isocalc_points_per_mz']

    def _isodist(self, sf_adduct):
        sf_adduct_simplified = complex_to_simple(sf_adduct)
        sf_adduct_obj = SumFormulaParser.parse_string(sf_adduct_simplified)
        # TODO: sigma, points_per_mz change patterns so should be stored in the DB as well
        return complete_isodist(sf_adduct_obj, sigma=self.sigma, charge=self.charge, pts_per_mz=self.points_per_mz)

    def iso_peaks(self, sf_id, sf, adduct):
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
            # print format_exc()
            print sf, adduct, e.message
        except Exception as e:
            raise Exception(e.message)

        except ValueError as e:
            logger.warning('(%s, %s) - %s', sf, adduct, e.message)
        finally:
            return sf_id, adduct, res_dict


def list_of_floats_to_str(l):
    return ','.join(map(lambda x: '{:.6f}'.format(x), l))


def format_peak_str(db_id, sf_id, adduct, peak_dict):
    return '%s\t%s\t%s\t{%s}\t{%s}\t{%s}\t{%s}' % (
        db_id, sf_id, adduct,
        list_of_floats_to_str(peak_dict['centr_mzs']),
        list_of_floats_to_str(peak_dict['centr_ints']),
        list_of_floats_to_str(peak_dict['profile_mzs']),
        list_of_floats_to_str(peak_dict['profile_ints'])
    )


def valid_sf_adduct(sf, adduct):
    if not (sf and adduct):
        logger.warning('Wrong arguments for pyisocalc: sf={} or adduct={}', sf, adduct)
        return False
    else:
        return True


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
        sfid_sf_adduct = self.db.select(sf_id_sf_adduct_sql, self.db_id)
        stored_sf_adduct_set = set(map(lambda t: t[1:3], sfid_sf_adduct))
        sf_adduct_cand = self.find_sf_adduct_cand(stored_sf_adduct_set)

        if sf_adduct_cand:
            peak_lines = self.generate_theor_peaks(sf_adduct_cand)
            self._import_theor_peaks_to_db(peak_lines)

    def find_sf_adduct_cand(self, stored_sf_adduct):
        logger.info('Checking theoretical peaks saved in the DB')
        formula_list = self.db.select(agg_formula_sql, self.db_id)
        cand_sf_adduct = [sf_row + (adduct,) for sf_row in formula_list for adduct in self.adducts]
        return filter(lambda (sf_id, sf, adduct): (sf, adduct) not in stored_sf_adduct, cand_sf_adduct)

    def generate_theor_peaks(self, sf_adduct_cand):
        logger.info('Generating missing peaks')
        iso_peaks = self.isocalc_wrapper.iso_peaks
        db_id = self.db_id
        sf_adduct_cand_rdd = self.sc.parallelize(sf_adduct_cand, numSlices=8)
        peak_lines = (sf_adduct_cand_rdd
                      .filter(lambda (_, sf, adduct): valid_sf_adduct(sf, adduct))
                      .map(lambda args: iso_peaks(*args))
                      .map(lambda args: format_peak_str(db_id, *args))
                      .collect())
        return peak_lines

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        if not exists(self.theor_peaks_tmp_dir):
            makedirs(self.theor_peaks_tmp_dir)

        peak_lines_path = join(self.theor_peaks_tmp_dir, 'peak_lines.csv')
        with open(peak_lines_path, 'w') as f:
            f.write('\n'.join(peak_lines))

        with open(peak_lines_path) as peaks_file:
            self.db.copy(peaks_file, 'theor_peaks')
