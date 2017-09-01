from collections import OrderedDict
import pandas as pd
import logging
import requests

from sm.engine.db import DB
from sm.engine.util import SMConfig

logger = logging.getLogger('sm-engine')

SF_INS = 'INSERT INTO sum_formula (db_id, sf) values (%s, %s)'
SF_COUNT = 'SELECT count(*) FROM sum_formula WHERE db_id = %s'
SF_SELECT = 'SELECT id, sf FROM sum_formula WHERE db_id = %s'
THEOR_PEAKS_TARGET_ADD_SEL = (
    'SELECT sf.id, adduct, centr_mzs, centr_ints '
    'FROM theor_peaks p '
    'JOIN sum_formula sf ON sf.sf = p.sf AND sf.db_id = %s '
    'WHERE adduct = ANY(%s) AND ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s '
    'AND charge = %s '
    'ORDER BY sf.id, adduct')

THEOR_PEAKS_DECOY_ADD_SEL = (
    'SELECT DISTINCT sf.id, decoy_add as adduct, centr_mzs, centr_ints '
    'FROM theor_peaks p '
    'JOIN sum_formula sf ON sf.sf = p.sf AND sf.db_id = %s '
    'JOIN target_decoy_add td on td.job_id = %s '
    'AND td.db_id = sf.db_id AND td.sf_id = sf.id AND td.decoy_add = p.adduct '
    'WHERE ROUND(sigma::numeric, 6) = %s AND pts_per_mz = %s AND charge = %s '
    'ORDER BY sf.id, adduct')


class MolDBServiceWrapper(object):
    def __init__(self, service_url):
        self._service_url = service_url
        self._session = requests.Session()

    def _fetch(self, url):
        r = self._session.get(url)
        r.raise_for_status()
        return r.json()['data']

    def find_db_by_id(self, id):
        url = '{}/databases/{}'.format(self._service_url, id)
        return self._fetch(url)

    def find_db_by_name_version(self, name, version=None):
        url = '{}/databases?name={}'.format(self._service_url, name)
        if version:
            url += '&version={}'.format(version)
        return self._fetch(url)

    def fetch_db_sfs(self, db_id):
        return self._fetch('{}/databases/{}/sfs'.format(self._service_url, db_id))

    def fetch_molecules(self, db_id, sf=None):
        if sf:
            url = '{}/databases/{}/molecules?sf={}&fields=mol_id,mol_name'
            return self._fetch(url.format(self._service_url, db_id, sf))
        else:
            # TODO: replace one large request with several smaller ones
            url = '{}/databases/{}/molecules?fields=sf,mol_id,mol_name&limit=10000000'
            return self._fetch(url.format(self._service_url, db_id))


class MolecularDB(object):
    """ A class representing a molecule database to search through.
        Provides several data structures used in the engine to speed up computation

        Args
        ----------
        name: str
        version: str
            If None the latest version will be used
        iso_gen_config : dict
            Isotope generator configuration
        mol_db_service : sm.engine.MolDBServiceWrapper
            Molecular database ID/name resolver
        db : DB
            Database connector
        """

    def __init__(self, id=None, name=None, version=None, iso_gen_config=None,
                 mol_db_service=None, db=None):
        self._iso_gen_config = iso_gen_config
        sm_config = SMConfig.get_conf()
        self._mol_db_service = mol_db_service or MolDBServiceWrapper(sm_config['services']['mol_db'])
        self._db = db

        if id is not None:
            data = self._mol_db_service.find_db_by_id(id)
        elif name is not None:
            data = self._mol_db_service.find_db_by_name_version(name, version)[0]
        else:
            raise Exception('MolDB id or name should be provided')

        self._id, self._name, self._version = data['id'], data['name'], data['version']
        self._sf_df = None
        self._job_id = None
        self._sfs = None

    def __str__(self):
        return '{} {}'.format(self.name, self.version)

    @property
    def id(self):
        return self._id

    @property
    def name(self):
        return self._name

    @property
    def version(self):
        return self._version

    def set_job_id(self, job_id):
        self._job_id = job_id

    def get_molecules(self, sf=None):
        """ Returns a dataframe with (mol_id, mol_name) or (sf, mol_id, mol_name) rows

        Args
        ----------
        sf: str
        Returns
        ----------
            pd.DataFrame
        """
        return pd.DataFrame(self._mol_db_service.fetch_molecules(self.id, sf=sf))

    @property
    def sfs(self):
        if not self._sfs:
            sfs = self._mol_db_service.fetch_db_sfs(self.id)
            if self._db.select_one(SF_COUNT, self._id)[0] == 0:
                rows = [(self._id, sf) for sf in sfs]
                self._db.insert(SF_INS, rows)
            self._sfs = OrderedDict(self._db.select(SF_SELECT, self._id))
        return self._sfs

    @property
    def sf_df(self):
        if self._sf_df is None:
            iso_gen_conf = self._iso_gen_config
            charge = '{}{}'.format(iso_gen_conf['charge']['polarity'], iso_gen_conf['charge']['n_charges'])
            target_sf_peaks_rs = self._db.select(THEOR_PEAKS_TARGET_ADD_SEL, self._id,
                                                 iso_gen_conf['adducts'], iso_gen_conf['isocalc_sigma'],
                                                 iso_gen_conf['isocalc_pts_per_mz'], charge)
            assert target_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (target)'

            decoy_sf_peaks_rs = self._db.select(THEOR_PEAKS_DECOY_ADD_SEL, self._id, self._job_id,
                                                iso_gen_conf['isocalc_sigma'], iso_gen_conf['isocalc_pts_per_mz'],
                                                charge)
            assert decoy_sf_peaks_rs, 'No formulas matching the criteria were found in theor_peaks! (decoy)'

            sf_peak_rs = target_sf_peaks_rs + decoy_sf_peaks_rs
            self._sf_df = (pd.DataFrame(sf_peak_rs, columns=['sf_id', 'adduct', 'centr_mzs', 'centr_ints'])
                           .sort_values(['sf_id', 'adduct']))
            self._check_formula_uniqueness(self._sf_df)

            logger.info('Loaded %s sum formula, adduct combinations from the DB', self._sf_df.shape[0])
        return self._sf_df

    @staticmethod
    def _check_formula_uniqueness(sf_df):
        uniq_sf_adducts = len({(r.sf_id, r.adduct) for r in sf_df.itertuples()})
        assert uniq_sf_adducts == sf_df.shape[0], \
            'Not unique formula-adduct combinations {} != {}'.format(uniq_sf_adducts, sf_df.shape[0])

    @staticmethod
    def sf_peak_gen(sf_df):
        for sf_id, adduct, mzs, _ in sf_df.values:
            for pi, mz in enumerate(mzs):
                yield sf_id, adduct, pi, mz

    def get_ion_peak_df(self):
        return pd.DataFrame(self.sf_peak_gen(self.sf_df),
                            columns=['sf_id', 'adduct', 'peak_i', 'mz']).sort_values(by='mz')

    def get_ion_sorted_df(self):
        return self.sf_df[['sf_id', 'adduct']].copy().set_index(['sf_id', 'adduct']).sort_index()

    def get_sf_peak_ints(self):
        return {(r.sf_id, r.adduct): r.centr_ints for r in self.sf_df.itertuples()}
