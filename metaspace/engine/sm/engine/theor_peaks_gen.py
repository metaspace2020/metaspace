from os import makedirs
from os.path import join, exists
import logging
from io import StringIO
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula
from itertools import product

from sm.engine.util import SMConfig
from sm.engine.db import DB
from sm.engine.fdr import DECOY_ADDUCTS
from sm.engine.isocalc_wrapper import IsocalcWrapper, Ion, IonCentroids

logger = logging.getLogger('sm-engine')

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
        self._ds_config = ds_config
        self._adducts = self._ds_config['isotope_generation']['adducts']

        self._sc = sc
        self._db = db
        self._mol_db = mol_db

    def find_sf_adduct_cand(self, sf_list, stored_sf_adduct):
        """
        Args
        ----
        sf_list : list
            List of molecular formulae to search through
        stored_sf_adduct : list
            List of (formula, adduct) pairs which have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database
        """
        assert sf_list, 'Empty sum formula, adduct list!'
        if self._ds_config['isotope_generation']['charge']['polarity'] == '-':
            sf_list = [sf for sf in sf_list if 'H' in sf]
        adducts = set(self._adducts) | set(DECOY_ADDUCTS)
        return list(set(product(sf_list, adducts)) - set(stored_sf_adduct))

    def _import_theor_peaks_to_db(self, peak_lines):
        logger.info('Saving new peaks to the DB')
        inp = StringIO('\n'.join(peak_lines))
        self._db.copy(inp, 'theor_peaks')

    def _remove_invalid_sfs_from_db(self, sfs):
        if sfs:
            logger.warning('Removing invalid formulas: {}'.format(sfs))
            self._db.alter('DELETE FROM sum_formula where sf = ANY(%s)', sfs)

    def generate_theor_peaks(self, isocalc, sf_adduct_cand):
        """
        Args
        ----
        isocalc: IsocalcWrapper
        sf_adduct_cand : list
            List of (formula id, formula, adduct) triples which don't have theoretical patterns saved in the database

        Returns
        -------
        : list
            List of strings with formatted theoretical peaks data
        """
        logger.info('Generating missing peaks')

        # calc_iso_peaks = self._isocalc_wrapper.isotope_peaks
        # format_iso_peaks = self._isocalc_wrapper.format_peaks

        n = 2 ** 16
        for i in range(0, len(sf_adduct_cand), n):
            cand_ions = [Ion(sf, adduct) for sf, adduct in sf_adduct_cand[i:i + n]]
            sf_adduct_cand_rdd = self._sc.parallelize(cand_ions, numSlices=128)
            ion_centroids_rdd = (sf_adduct_cand_rdd
                                 .map(lambda ion: IonCentroids(ion, isocalc.isotope_peaks(ion)))
                                 .cache())
            
            invalid_sfs = (ion_centroids_rdd
                           .filter(lambda ion_centr: len(ion_centr.centroids.mzs) == 0)
                           .map(lambda ion_centr: ion_centr.ion.sf)
                           .distinct()
                           .collect())
            self._remove_invalid_sfs_from_db(invalid_sfs)
            
            ion_centr_lines = (ion_centroids_rdd
                               .filter(lambda ion_centr: len(ion_centr.centroids.mzs) > 0)
                               .map(isocalc.format_peaks)
                               .collect())
            return ion_centr_lines

    def run(self):
        """ Starts peaks generation. Checks all formula peaks saved in the database and
            generates peaks only for new ones
        """
        logger.info('Running theoretical peaks generation')

        isocalc = IsocalcWrapper(self._ds_config['isotope_generation'])

        sf_list = self._mol_db.sfs.values()
        stored_sf_adduct = self._db.select(SF_ADDUCT_SEL,
                                           isocalc.sigma,
                                           isocalc.charge,
                                           isocalc.pts_per_mz)

        sf_adduct_cand = self.find_sf_adduct_cand(sf_list, stored_sf_adduct)
        logger.info('%d saved (sf, adduct)s, %s not saved (sf, adduct)s', len(stored_sf_adduct), len(sf_adduct_cand))

        if sf_adduct_cand:
            ion_centr_lines = self.generate_theor_peaks(isocalc, sf_adduct_cand)
            self._import_theor_peaks_to_db(ion_centr_lines)
