import pandas as pd
import logging


logger = logging.getLogger('sm-engine')

THEOR_PEAKS_TARGET_ADD_SEL = (
    'SELECT sf.id, adduct, centr_mzs[1:%s], centr_ints[1:%s] '
    'FROM theor_peaks p '
    'JOIN agg_formula sf ON sf.sf = p.sf AND sf.db_id = %s '
    'WHERE adduct = ANY(%s) AND ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s '
    'AND charge = %s '
    'ORDER BY sf.id, adduct')

# FIXME: target_decoy_add table is getting too big
THEOR_PEAKS_DECOY_ADD_SEL = (
    'SELECT DISTINCT sf.id, decoy_add as adduct, centr_mzs[1:%s], centr_ints[1:%s] '
    'FROM theor_peaks p '
    'JOIN agg_formula sf ON sf.sf = p.sf AND sf.db_id = %s '
    'JOIN target_decoy_add td on td.job_id = %s '
    'AND td.db_id = sf.db_id AND td.sf_id = sf.id AND td.decoy_add = p.adduct '
    'WHERE ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s AND charge = %s '
    'ORDER BY sf.id, adduct')


# TODO: add tests
class FormulasSegm(object):
    """ A class representing a molecule database to search through.
        Provides several data structured used in the engine to speedup computation

        Args
        ----------
        job_id: int
        db_id: int
        ds_config : dict
            Dataset configuration
        db : engine.db.DB
        """
    ISOTOPIC_PEAK_N = 4

    def __init__(self, job_id, db_id, ds_config, db):
        self.job_id = job_id
        self.db_id = db_id
        self.ppm = ds_config['image_generation']['ppm']
        iso_gen_conf = ds_config['isotope_generation']
        charge = '{}{}'.format(iso_gen_conf['charge']['polarity'], iso_gen_conf['charge']['n_charges'])
        target_sf_peaks_rs = db.select(THEOR_PEAKS_TARGET_ADD_SEL, self.ISOTOPIC_PEAK_N, self.ISOTOPIC_PEAK_N,
                                       self.db_id,
                                       iso_gen_conf['adducts'], iso_gen_conf['isocalc_sigma'],
                                       iso_gen_conf['isocalc_pts_per_mz'], charge)
        assert target_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (target)'

        decoy_sf_peaks_rs = db.select(THEOR_PEAKS_DECOY_ADD_SEL, self.ISOTOPIC_PEAK_N, self.ISOTOPIC_PEAK_N,
                                      self.db_id, self.job_id,
                                      iso_gen_conf['isocalc_sigma'], iso_gen_conf['isocalc_pts_per_mz'], charge)
        assert decoy_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (decoy)'

        sf_peak_rs = target_sf_peaks_rs + decoy_sf_peaks_rs
        self.sf_df = (pd.DataFrame(sf_peak_rs, columns=['sf_id', 'adduct', 'centr_mzs', 'centr_ints'])
                      .sort_values(['sf_id', 'adduct']))
        self.check_formula_uniqueness(self.sf_df)

        logger.info('Loaded %s sum formula, adduct combinations from the DB', self.sf_df.shape[0])

    @staticmethod
    def check_formula_uniqueness(sf_df):
        uniq_sf_adducts = pd.unique(sf_df[['sf_id', 'adduct']].values).shape[0]
        assert uniq_sf_adducts == sf_df.shape[0],\
            'Not unique formula-adduct combinations {} != {}'.format(uniq_sf_adducts, sf_df.shape[0])

    @staticmethod
    def sf_peak_gen(sf_df):
        for sf_id, adduct, mzs, _ in sf_df.values:
            for pi, mz in enumerate(mzs):
                yield sf_id, adduct, pi, mz

    def get_sf_peak_df(self):
        return pd.DataFrame(self.sf_peak_gen(self.sf_df),
                            columns=['sf_id', 'adduct', 'peak_i', 'mz']).sort_values(by='mz')

    def get_sf_adduct_sorted_df(self):
        return self.sf_df[['sf_id', 'adduct']].copy().set_index(['sf_id', 'adduct']).sort_index()

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

