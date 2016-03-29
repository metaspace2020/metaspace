import numpy as np
import pandas as pd

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


class FormulasSegm(object):

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
        self.sf_df = pd.DataFrame(sf_peak_rs, columns=['sf_id', 'adduct', 'centr_mzs', 'centr_ints'])
        self.check_formula_uniqueness(self.sf_df)

        logger.info('Loaded %s sum formula, adduct combinations from the DB', self.sf_df.shape[0])

    @staticmethod
    def check_formula_uniqueness(sf_df):
        uniq_sf_adducts = pd.unique(sf_df[['sf_id', 'adduct']].values).shape[0]
        assert uniq_sf_adducts == sf_df.shape[0],\
            'Not unique formula-adduct combinations {} != {}'.format(uniq_sf_adducts, sf_df.shape[0])

    @staticmethod
    def sf_peak_gen(sf_df):
        for _, row in sf_df.iterrows():
            for pi, mz in enumerate(row['centr_mzs']):
                yield row['sf_id'], row['adduct'], pi, mz

    def get_sf_peak_df(self):
        return pd.DataFrame(self.sf_peak_gen(self.sf_df),
                            columns=['sf_id', 'adduct', 'peak_i', 'mz']).sort_values(by='mz')

    def get_sf_peak_ints(self):
        return dict(zip(zip(self.sf_df.sf_id, self.sf_df.adduct), self.sf_df.centr_ints))

    def get_sf_adduct_peaksn(self):
        """
        Returns
        -------
        : list
            An array of triples (formula id, adduct, number of theoretical peaks)
        """
        # return zip(self.sf_ids, self.adducts, map(len, self.sf_theor_peaks))
        return zip(self.sf_df.sf_id, self.sf_df.adduct, self.sf_df.centr_mzs.map(len))

