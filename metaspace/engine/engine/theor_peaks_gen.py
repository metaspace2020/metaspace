from os import makedirs
from os.path import join, exists

from engine.db import DB
from engine.util import logger
from engine.isocalc_wrapper import IsocalcWrapper
from engine.fdr import DECOY_ADDUCTS
from pyMS.pyisocalc.pyisocalc import parseSumFormula


DB_ID_SEL = 'SELECT id FROM formula_db WHERE name = %s'
AGG_FORMULA_SEL = 'SELECT id, sf FROM agg_formula where db_id = %s'
SF_ADDUCT_SEL = ('SELECT sf, adduct FROM theor_peaks p '
                 'JOIN agg_formula f on p.sf_id = f.id and p.db_id = f.db_id '
                 'WHERE p.db_id = %s AND ROUND(sigma::numeric, 6) = %s AND charge = %s AND pts_per_mz = %s')


class TheorPeaksGenerator(object):
    """ Generator of theoretical isotope peaks for all molecules in a database.

    Args
    ----------
    sc : pyspark.SparkContext
    sm_config : dict
        SM engine config
    ds_config : dict
        Dataset config
    """
    def __init__(self, sc, sm_config, ds_config):  # TODO: replace sm_config with db
        self.sc = sc
        self.sm_config = sm_config
        self.ds_config = ds_config

        self.theor_peaks_tmp_dir = join(sm_config['fs']['data_dir'], 'theor_peaks_gen')
        self.db = DB(sm_config['db'])

        self.adducts = self.ds_config['isotope_generation']['adducts']

        self.isocalc_wrapper = IsocalcWrapper(self.ds_config['isotope_generation'])

    @staticmethod
    def _sf_elements(sf):
        return [seg.element().name() for seg in parseSumFormula(sf).get_segments()]

    @classmethod
    def _valid_sf_adduct(cls, sf, adduct):
        if sf is None or adduct is None or sf == 'None' or adduct == 'None':
            logger.warning('Invalid sum formula or adduct: sf=%s, adduct=%s', sf, adduct)
            return False

        if '-' in adduct and adduct.strip('-') not in cls._sf_elements(sf):
            logger.info('No negative adduct element in the sum formula: sf=%s, adduct=%s', sf, adduct)
            return False

        return True

    def run(self):
        """ Starts peaks generation. Checks all formula peaks saved in the database and
        generates peaks only for new ones"""
        logger.info('Running theoretical peaks generation')

        db_id = self.db.select_one(DB_ID_SEL, self.ds_config['database']['name'])[0]
        formula_list = self.apply_database_filters(self.db.select(AGG_FORMULA_SEL, db_id))

        stored_sf_adduct = self.db.select(SF_ADDUCT_SEL, db_id,
                                          self.isocalc_wrapper.sigma,
                                          self.isocalc_wrapper.charge,
                                          self.isocalc_wrapper.pts_per_mz)

        sf_adduct_cand = self.find_sf_adduct_cand(formula_list, set(stored_sf_adduct))
        logger.info('%d saved (sf, adduct)s, %s not saved (sf, adduct)s', len(stored_sf_adduct), len(sf_adduct_cand))

        if sf_adduct_cand:
            self.generate_theor_peaks(sf_adduct_cand)

    def apply_database_filters(self, formula_list):
        """ Filters according to settings in dataset config

        Args
        ----
        formula_list : list
            List of pairs (id, sum formula) to search through

        Returns
        -------
        : list
            Filtered list of pairs (id, sum formula)
        """
        if 'organic' in map(lambda s: s.lower(), self.ds_config['database'].get('filters', [])):
            logger.info('Organic sum formula filter has been applied')
            return filter(lambda (_, sf): 'C' in self._sf_elements(sf), formula_list)
        return formula_list

    def find_sf_adduct_cand(self, formula_list, stored_sf_adduct):
        """
        Args
        ----
        formula_list : list
            List of pairs (id, sum formula) to search through
        stored_sf_adduct : set
            Set of (formula, adduct) pairs which have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database
        """
        assert formula_list, 'Emtpy agg_formula table!'
        adducts = set(self.adducts) | set(DECOY_ADDUCTS)
        cand = [(id, sf, a) for (id, sf) in formula_list for a in adducts]
        return filter(lambda (sf_id, sf, adduct): (sf, adduct) not in stored_sf_adduct, cand)

    def generate_theor_peaks(self, sf_adduct_cand):
        """
        Args
        ----
        sf_adduct_cand : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of strings with formatted theoretical peaks data
        """
        logger.info('Generating missing peaks')
        formatted_iso_peaks = self.isocalc_wrapper.formatted_iso_peaks
        db_id = self.db.select_one(DB_ID_SEL, self.ds_config['database']['name'])[0]
        n = 100
        for i in xrange(0, len(sf_adduct_cand), n):
            sf_adduct_cand_rdd = self.sc.parallelize(sf_adduct_cand[i:i+n])
            peak_lines = (sf_adduct_cand_rdd
                          .flatMap(lambda (sf_id, sf, adduct): formatted_iso_peaks(db_id, sf_id, sf, adduct))
                          .collect())
            self._import_theor_peaks_to_db(peak_lines)

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        if not exists(self.theor_peaks_tmp_dir):
            makedirs(self.theor_peaks_tmp_dir)

        peak_lines_path = join(self.theor_peaks_tmp_dir, 'peak_lines.csv')
        with open(peak_lines_path, 'w') as f:
            f.write('\n'.join(peak_lines))

        with open(peak_lines_path) as peaks_file:
            self.db.copy(peaks_file, 'theor_peaks')
