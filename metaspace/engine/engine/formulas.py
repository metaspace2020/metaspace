"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np


theor_peaks_sql = """
    select centr_mzs, centr_ints
    from theor_peaks p
    join formula_db d on d.id = p.db_id
    where d.name = %s and adduct = ANY(ARRAY[%s])
    order by sf_id, adduct
    """


class Formulas(object):

    def __init__(self, ds_config, db):
        self.ppm = ds_config['image_generation']['ppm']
        db_name = ds_config['inputs']['database']
        adducts = ds_config['isotope_generation']['adducts']

        sf_peaks = db.select(theor_peaks_sql, (db_name, adducts))
        self.sf_theor_peaks = [row[0] for row in sf_peaks]
        self.sf_theor_peak_ints = [row[1] for row in sf_peaks]

        # self.sf_peak_inds = np.insert(np.cumsum(map(len, self.sf_theor_peaks)), 0, 0)  # 0 - extra index

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
