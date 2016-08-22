from os import makedirs
from os.path import join, exists
import logging
from StringIO import StringIO
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

from sm.engine.db import DB
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.isocalc_wrapper import IsocalcWrapper


logger = logging.getLogger('sm-engine')

DB_ID_SEL = 'SELECT id FROM formula_db WHERE name = %s'
AGG_FORMULA_SEL = 'SELECT sf FROM agg_formula where db_id = %s'
SF_ADDUCT_SEL = ('SELECT sf, adduct FROM theor_peaks p '
                 'WHERE ROUND(sigma::numeric, 6) = %s AND charge = %s AND pts_per_mz = %s')


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
        self.sm_config = sm_config
        self.ds_config = ds_config
        self.adducts = self.ds_config['isotope_generation']['adducts']
        self.theor_peaks_tmp_dir = join(sm_config['fs']['base_path'], 'tmp_theor_peaks_gen')

        self.sc = sc
        self.db = DB(sm_config['db'])
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
        sf_list = [row[0] for row in self.db.select(AGG_FORMULA_SEL, db_id)]

        stored_sf_adduct = self.db.select(SF_ADDUCT_SEL,
                                          self.isocalc_wrapper.sigma,
                                          self.isocalc_wrapper.charge,
                                          self.isocalc_wrapper.pts_per_mz)

        sf_adduct_cand = self.find_sf_adduct_cand(sf_list, set(stored_sf_adduct))
        logger.info('%d saved (sf, adduct)s, %s not saved (sf, adduct)s', len(stored_sf_adduct), len(sf_adduct_cand))

        if sf_adduct_cand:
            self.generate_theor_peaks(sf_adduct_cand)

    def find_sf_adduct_cand(self, sf_list, stored_sf_adduct):
        """
        Args
        ----
        sf_list : list
            List of pairs (id, sum formula) to search through
        stored_sf_adduct : set
            Set of (formula, adduct) pairs which have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database
        """
        assert sf_list, 'Emtpy agg_formula table!'
        adducts = set(self.adducts) | set(DECOY_ADDUCTS)
        cand = [(sf, a) for sf in sf_list for a in adducts]
        return filter(lambda (sf, adduct): (sf, adduct) not in stored_sf_adduct, cand)

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
        n = 10000
        for i in xrange(0, len(sf_adduct_cand), n):
            sf_adduct_cand_rdd = self.sc.parallelize(sf_adduct_cand[i:i+n], numSlices=128)
            peak_lines = (sf_adduct_cand_rdd
                          .flatMap(lambda (sf, adduct): formatted_iso_peaks(sf, adduct))
                          .collect())
            self._import_theor_peaks_to_db(peak_lines)

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        inp = StringIO('\n'.join(peak_lines))
        self.db.copy(inp, 'theor_peaks')