import numpy as np
import pandas as pd

from engine.util import logger


THEOR_PEAKS_SQL = ('SELECT sf_id, adduct, centr_mzs, centr_ints '
                   'FROM theor_peaks p '
                   'JOIN formula_db d ON d.id = p.db_id '
                   'WHERE d.name = %s AND adduct = ANY(%s) AND ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s '
                   'AND charge = %s'
                   'ORDER BY sf_id, adduct')


class FormulasSegm(object):

    def __init__(self, ds_config, db):
        db_name = ds_config['database']['name']
        iso_gen_conf = ds_config['isotope_generation']
        charge = '{}{}'.format(iso_gen_conf['charge']['polarity'], iso_gen_conf['charge']['n_charges'])
        sf_peak_rs = db.select(THEOR_PEAKS_SQL, db_name, iso_gen_conf['adducts'], iso_gen_conf['isocalc_sigma'],
                               iso_gen_conf['isocalc_pts_per_mz'], charge)
        assert sf_peak_rs, 'No formulas matching the criteria were found in theor_peaks!'

        self.sf_df = pd.DataFrame(sf_peak_rs, columns=['sf_id', 'adduct', 'centr_mzs', 'centr_ints'])

        self.sf_peak_df = pd.DataFrame(self.sf_peak_gen(self.sf_df), columns=['sf_id', 'adduct', 'peak_i', 'mz']).sort('mz')
        self.check_formula_uniqueness(self.sf_peak_df)

        logger.info('Loaded %s sum formula, adduct combinations from the DB', self.sf_df.shape[0])

    @staticmethod
    def sf_peak_gen(sf_df):
        for _, row in sf_df.iterrows():
            for pi, mz in enumerate(row['centr_mzs']):
                yield row['sf_id'], row['adduct'], pi, mz

    @staticmethod
    def check_formula_uniqueness(sf_peak_df):
        uniq_sf_adduct_peak_n = pd.unique(sf_peak_df[['sf_id', 'adduct', 'peak_i']].values).shape[0]
        assert uniq_sf_adduct_peak_n == sf_peak_df.shape[0],\
            'Not unique formula-adduct combinations {} != {}'.format(uniq_sf_adduct_peak_n, sf_peak_df.shape[0])

    def get_sf_peak_ints(self):
        return zip(zip(self.sf_df.sf_id, self.sf_df.adduct), self.sf_df.centr_ints)

    def get_sf_adduct_peaksn(self):
        """
        Returns
        -------
        : list
            An array of triples (formula id, adduct, number of theoretical peaks)
        """
        # return zip(self.sf_ids, self.adducts, map(len, self.sf_theor_peaks))
        return zip(self.sf_df.sf_id, self.sf_df.adduct, self.sf_df.centr_mzs.map(len))

