"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np


THEOR_PEAKS_SQL = ('SELECT sf_id, adduct, centr_mzs, centr_ints '
                   'FROM theor_peaks p '
                   'JOIN formula_db d ON d.id = p.db_id '
                   'WHERE d.name = %s AND adduct = ANY(%s) '
                   'ORDER BY sf_id, adduct')


class Formulas(object):

    def __init__(self, ds_config, db):
        self.ppm = ds_config['image_generation']['ppm']
        self.db_name = ds_config['inputs']['database']
        adducts = ds_config['isotope_generation']['adducts']

        sf_peaks = db.select(THEOR_PEAKS_SQL, self.db_name, adducts)
        self.sf_ids, self.adducts, self.sf_theor_peaks, self.sf_theor_peak_ints = zip(*sf_peaks)

    # TODO: add logging messages with details
    def get_sf_peak_bounds(self):
        lower = np.array([mz - self.ppm*mz/1e6 for sf_peaks in self.sf_theor_peaks for mz in sf_peaks])
        upper = np.array([mz + self.ppm*mz/1e6 for sf_peaks in self.sf_theor_peaks for mz in sf_peaks])
        return lower, upper

    def get_sf_peak_map(self):
        return np.array([(i, j)
                         for i, sf_peaks in enumerate(self.sf_theor_peaks)
                         for j, __ in enumerate(sf_peaks)])

    def get_sf_peak_ints(self):
        return self.sf_theor_peak_ints

    def get_sf_peaks(self):
        return self.sf_theor_peaks

    def get_sf_adduct_peaksn(self):
        return zip(self.sf_ids, self.adducts, map(len, self.sf_theor_peaks))

