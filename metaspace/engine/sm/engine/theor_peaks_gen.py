from os import makedirs
from os.path import join, exists
import logging
from io import StringIO
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from itertools import product

from sm.engine.util import SMConfig
from sm.engine.db import DB
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.isocalc_wrapper import IsocalcWrapper


logger = logging.getLogger('engine')

SF_ADDUCT_SEL = ('SELECT sf, adduct FROM theor_peaks p '
                 'WHERE ROUND(sigma::numeric, 6) = %s AND charge = %s AND pts_per_mz = %s')


class TheorPeaksGenerator(object):
    """ Generator of theoretical isotope peaks for all molecules in a database.

    Args
    ----------
    sc : pyspark.SparkContext
    ds_config : dict
        Dataset config
    """
    def __init__(self, sc, mol_db, ds_config, db=None):
        sm_config = SMConfig.get_conf()
        self._ds_config = ds_config
        self._adducts = self._ds_config['isotope_generation']['adducts']

        self._sc = sc
        self._db = db
        self._mol_db = mol_db
        self._isocalc_wrapper = IsocalcWrapper(self._ds_config['isotope_generation'])

    def run(self):
        """ Starts peaks generation. Checks all formula peaks saved in the database and
        generates peaks only for new ones"""
        logger.info('Running theoretical peaks generation')

        sf_list = self._mol_db.sfs.values()
        stored_sf_adduct = self._db.select(SF_ADDUCT_SEL,
                                           self._isocalc_wrapper.sigma,
                                           self._isocalc_wrapper.charge,
                                           self._isocalc_wrapper.pts_per_mz)

        sf_adduct_cand = self.find_sf_adduct_cand(sf_list, set(stored_sf_adduct))
        logger.info('%d saved (sf, adduct)s, %s not saved (sf, adduct)s', len(stored_sf_adduct), len(sf_adduct_cand))

        if sf_adduct_cand:
            self.generate_theor_peaks(sf_adduct_cand)

    def find_sf_adduct_cand(self, sf_list, stored_sf_adduct):
        """
        Args
        ----
        sf_list : list
            List of molecular formulae to search through
        stored_sf_adduct : set
            Set of (formula, adduct) pairs which have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database
        """
        assert sf_list, 'Empty sum formula, adduct list!'
        if self._ds_config['isotope_generation']['charge']['polarity'] == '-':
            sf_list = [sf for sf in sf_list if 'H' in sf]
        adducts = set(self._adducts) | set(DECOY_ADDUCTS)
        return list(set(product(sf_list, adducts)) - stored_sf_adduct)

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
        formatted_iso_peaks = self._isocalc_wrapper.formatted_iso_peaks
        n = 2**16
        def format_peaks(ion):
            sf, adduct = ion
            return formatted_iso_peaks(sf, adduct)

        for i in range(0, len(sf_adduct_cand), n):
            sf_adduct_cand_rdd = self._sc.parallelize(sf_adduct_cand[i:i + n], numSlices=128)
            peak_lines = sf_adduct_cand_rdd.flatMap(format_peaks).collect()
            self._import_theor_peaks_to_db(peak_lines)

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        inp = StringIO('\n'.join(peak_lines))
        self._db.copy(inp, 'theor_peaks')
