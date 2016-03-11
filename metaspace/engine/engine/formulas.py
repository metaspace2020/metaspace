import numpy as np
from engine.util import logger


THEOR_PEAKS_TARGET_ADD_SEL = (
    'SELECT sf_id, adduct, centr_mzs, centr_ints '
    'FROM theor_peaks p '
    'JOIN formula_db db ON db.id = p.db_id '
    'WHERE db.id = %s AND adduct = ANY(%s) AND ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s '
    'AND charge = %s '
    'ORDER BY sf_id, adduct')

THEOR_PEAKS_DECOY_ADD_SEL = (
    'SELECT DISTINCT p.sf_id, decoy_add as adduct, centr_mzs, centr_ints '
    'FROM theor_peaks p '
    'JOIN formula_db db ON db.id = p.db_id '
    'JOIN target_decoy_add td on td.job_id = %s '
    'AND td.db_id = p.db_id AND td.sf_id = p.sf_id AND td.decoy_add = p.adduct '
    'WHERE db.id = %s AND ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s AND charge = %s '
    'ORDER BY sf_id, adduct')


class Formulas(object):
    """ A class representing a molecule database to search through.
    Provides several data structured used in the engine to speedup computation

    Args
    ----------
    ds_config : dict
        Dataset configuration
    db : engine.db.DB
    """

    def __init__(self, job_id, db_id, ds_config, db):
        self.job_id = job_id
        self.db_id = db_id
        self.ppm = ds_config['image_generation']['ppm']
        iso_gen_conf = ds_config['isotope_generation']
        charge = '{}{}'.format(iso_gen_conf['charge']['polarity'], iso_gen_conf['charge']['n_charges'])

        target_sf_peaks_rs = db.select(THEOR_PEAKS_TARGET_ADD_SEL, self.db_id,
                                       iso_gen_conf['adducts'], iso_gen_conf['isocalc_sigma'],
                                       iso_gen_conf['isocalc_pts_per_mz'], charge)
        assert target_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (target)'

        decoy_sf_peaks_rs = db.select(THEOR_PEAKS_DECOY_ADD_SEL, self.job_id, self.db_id,
                                      iso_gen_conf['isocalc_sigma'], iso_gen_conf['isocalc_pts_per_mz'], charge)
        assert decoy_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (decoy)'

        sf_peak_rs = target_sf_peaks_rs + decoy_sf_peaks_rs
        self.sf_ids, self.adducts, self.sf_theor_peaks, self.sf_theor_peak_ints = zip(*sf_peak_rs)
        self.check_formula_uniqueness(self.sf_ids, self.adducts)

        logger.info('Loaded %s sum formulas from the DB', len(self.sf_ids))

    @staticmethod
    def check_formula_uniqueness(formula_ids, adducts):
        pairs = zip(formula_ids, adducts)
        uniq_pairs = set(pairs)
        assert len(uniq_pairs) == len(pairs), \
            'Not unique formula-adduct combinations {} != {}'.format(len(uniq_pairs), len(pairs))

    def get_sf_peak_bounds(self):
        """
        Returns
        -------
        : tuple
            A pair of ndarrays with bound mz values for each molecule from the molecule database
        """
        lower = np.array([mz - self.ppm * mz / 1e6 for sf_peaks in self.sf_theor_peaks for mz in sf_peaks])
        upper = np.array([mz + self.ppm * mz / 1e6 for sf_peaks in self.sf_theor_peaks for mz in sf_peaks])
        return lower, upper

    def get_sf_peak_map(self):
        """
        Returns
        -------
        : ndarray
            An array of pairs (formula index, local peak index)
        """
        return np.array([(i, j)
                         for i, sf_peaks in enumerate(self.sf_theor_peaks)
                         for j, __ in enumerate(sf_peaks)])

    def get_sf_peak_ints(self):
        """
        Returns
        -------
        : ndarray
            An array of arrays of theoretical peak intensities for each item of the molecule database
        """
        return self.sf_theor_peak_ints

    def get_sf_peaks(self):
        """
        Returns
        -------
        : ndarray
            An array of arrays of theoretical peak mzs for each item of the molecule database
        """
        return self.sf_theor_peaks

    def get_sf_adduct_peaksn(self):
        """
        Returns
        -------
        : list
            An array of triples (formula id, adduct, number of theoretical peaks)
        """
        return zip(self.sf_ids, self.adducts, map(len, self.sf_theor_peaks))
