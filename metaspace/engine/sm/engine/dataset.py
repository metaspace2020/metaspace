import json
import logging
from datetime import datetime
from typing import Dict

from sm.engine.config import SMConfig
from sm.engine.ds_config import DSConfig
from sm.engine.errors import UnknownDSID

logger = logging.getLogger('engine')


class DatasetStatus:
    """Stage of dataset lifecycle.

    Attributes:
        QUEUED: The dataset is queued for processing
        ANNOTATING: The processing is in progress
        FINISHED: The processing finished successfully (most common)
        FAILED: An error occurred during processing
    """

    QUEUED = 'QUEUED'
    ANNOTATING = 'ANNOTATING'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'


RESOL_POWER_PARAMS = {
    '70K': {'sigma': 0.00247585727028, 'fwhm': 0.00583019832869, 'pts_per_mz': 2019},
    '100K': {'sigma': 0.0017331000892, 'fwhm': 0.00408113883008, 'pts_per_mz': 2885},
    '140K': {'sigma': 0.00123792863514, 'fwhm': 0.00291509916435, 'pts_per_mz': 4039},
    '200K': {'sigma': 0.000866550044598, 'fwhm': 0.00204056941504, 'pts_per_mz': 5770},
    '250K': {'sigma': 0.000693240035678, 'fwhm': 0.00163245553203, 'pts_per_mz': 7212},
    '280K': {'sigma': 0.00061896431757, 'fwhm': 0.00145754958217, 'pts_per_mz': 8078},
    '500K': {'sigma': 0.000346620017839, 'fwhm': 0.000816227766017, 'pts_per_mz': 14425},
    '750K': {'sigma': 0.000231080011893, 'fwhm': 0.000544151844011, 'pts_per_mz': 21637},
    '1000K': {'sigma': 0.00017331000892, 'fwhm': 0.000408113883008, 'pts_per_mz': 28850},
}

FLAT_DS_CONFIG_KEYS = frozenset(
    {
        'analysis_version',
        'moldb_ids',
        'adducts',
        'ppm',
        'min_px',
        'n_peaks',
        'decoy_sample_size',
        'neutral_losses',
        'chem_mods',
        'compute_unused_metrics',
        'scoring_model',
    }
)


class Dataset:
    """Class for representing an IMS dataset"""

    DS_SEL = (
        'SELECT id, name, input_path, upload_dt, metadata, config, status, '
        '   status_update_dt, is_public '
        'FROM dataset WHERE id = %s'
    )
    DS_UPD = (
        'UPDATE dataset set name=%(name)s, input_path=%(input_path)s, upload_dt=%(upload_dt)s, '
        '   metadata=%(metadata)s, config=%(config)s, status=%(status)s, '
        '   status_update_dt=%(status_update_dt)s, is_public=%(is_public)s '
        'where id=%(id)s'
    )
    DS_INSERT = (
        'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
        '   status_update_dt, is_public) '
        'VALUES (%(id)s, %(name)s, %(input_path)s, %(upload_dt)s, '
        '   %(metadata)s, %(config)s, %(status)s, %(status_update_dt)s, %(is_public)s)'
    )

    ACQ_GEOMETRY_SEL = 'SELECT acq_geometry FROM dataset WHERE id = %s'
    ACQ_GEOMETRY_UPD = 'UPDATE dataset SET acq_geometry = %s WHERE id = %s'

    def __init__(  # pylint: disable=too-many-arguments
        self,
        *,
        id: str,  # pylint: disable=redefined-builtin
        name: str,
        input_path: str,
        upload_dt: datetime,
        metadata: Dict,
        config: DSConfig,
        status: str = DatasetStatus.QUEUED,
        status_update_dt: datetime = None,
        is_public: bool = True,
    ):
        self.id = id
        self.name = name
        self.input_path = input_path
        self.upload_dt = upload_dt
        self.status = status
        self.status_update_dt = status_update_dt or datetime.now()
        self.is_public = is_public

        self.metadata = metadata
        self.config = config
        self._sm_config = SMConfig.get_conf()

    def __str__(self):
        return str(self.__dict__)

    def __eq__(self, other):
        return self.__dict__ == other.__dict__

    def set_status(self, db, es, status):
        self.status = status
        self.status_update_dt = datetime.now()
        self.save(db, es)

    @classmethod
    def load(cls, db, ds_id):
        docs = db.select_with_fields(cls.DS_SEL, params=(ds_id,))
        if docs:
            return Dataset(**docs[0])

        raise UnknownDSID('Dataset does not exist: {}'.format(ds_id))

    def is_stored(self, db):
        res = db.select_one(self.DS_SEL, params=(self.id,))
        return bool(res)

    def save(self, db, es=None, allow_insert=False):
        doc = {
            'id': self.id,
            'name': self.name,
            'input_path': self.input_path,
            'upload_dt': self.upload_dt,
            'metadata': json.dumps(self.metadata or {}),
            'config': json.dumps(self.config or {}),
            'status': self.status,
            'status_update_dt': self.status_update_dt,
            'is_public': self.is_public,
        }
        if not self.is_stored(db):
            if allow_insert:
                db.insert(self.DS_INSERT, rows=[doc])
            else:
                raise UnknownDSID(f'Dataset does not exist: {self.id}')
        else:
            db.alter(self.DS_UPD, params=doc)
        logger.info(f'Inserted into dataset table: {self.id}, {self.name}')

        if es:
            es.sync_dataset(self.id)

    def get_acq_geometry(self, db):
        res = db.select_one(Dataset.ACQ_GEOMETRY_SEL, params=(self.id,))
        if not res:
            raise UnknownDSID('Dataset does not exist: {}'.format(self.id))
        return res[0]

    def save_acq_geometry(self, db, acq_geometry):
        db.alter(self.ACQ_GEOMETRY_UPD, params=(json.dumps(acq_geometry), self.id))

    def to_queue_message(self):
        msg = {'ds_id': self.id, 'ds_name': self.name, 'input_path': self.input_path}
        email = self.metadata.get('Submitted_By', {}).get('Submitter', {}).get('Email', None)
        if email:
            msg['user_email'] = email.lower()
        return msg


def _normalize_instrument(instrument):
    instrument = (instrument or '').lower()
    if any(phrase in instrument for phrase in ['orbitrap', 'exactive', 'exploris', 'hf-x', 'uhmr']):
        return 'Orbitrap'
    if any(phrase in instrument for phrase in ['fticr', 'ft-icr', 'ftms', 'ft-ms']):
        return 'FTICR'
    if any(phrase in instrument for phrase in ['tof', 'mrt', 'exploris', 'synapt', 'xevo']):
        return 'TOF'

    # Fall back to Orbitrap, because its resolving power as a function of mass lies between
    # the other analyzer types.
    return 'Orbitrap'


def _get_isotope_generation_from_metadata(metadata):
    assert 'MS_Analysis' in metadata

    sm_config = SMConfig.get_conf()

    polarity = metadata['MS_Analysis']['Polarity']
    polarity_sign = {'Positive': '+', 'Negative': '-'}[polarity]
    instrument = _normalize_instrument(metadata['MS_Analysis']['Analyzer'])
    resolving_power = metadata['MS_Analysis']['Detector_Resolving_Power']
    rp_mz = float(resolving_power['mz'])
    rp_resolution = float(resolving_power['Resolving_Power'])

    if instrument == 'FTICR':
        rp200 = rp_resolution * rp_mz / 200.0
    elif instrument == 'Orbitrap':
        rp200 = rp_resolution * (rp_mz / 200.0) ** 0.5
    else:
        rp200 = rp_resolution

    if rp200 < 85000:
        params = RESOL_POWER_PARAMS['70K']
    elif rp200 < 120000:
        params = RESOL_POWER_PARAMS['100K']
    elif rp200 < 195000:
        params = RESOL_POWER_PARAMS['140K']
    elif rp200 < 265000:
        params = RESOL_POWER_PARAMS['250K']
    elif rp200 < 390000:
        params = RESOL_POWER_PARAMS['280K']
    elif rp200 < 625000:
        params = RESOL_POWER_PARAMS['500K']
    elif rp200 < 875000:
        params = RESOL_POWER_PARAMS['750K']
    else:
        params = RESOL_POWER_PARAMS['1000K']

    default_adducts = sm_config['ds_config_defaults']['adducts'][polarity_sign]
    charge = {'+': 1, '-': -1}[polarity_sign]
    isocalc_sigma = float(f"{params['sigma']:f}")

    return default_adducts, charge, isocalc_sigma, instrument


# pylint: disable=too-many-arguments
def generate_ds_config(
    metadata,
    analysis_version=None,
    moldb_ids=None,
    adducts=None,
    ppm=None,
    min_px=None,
    n_peaks=None,
    decoy_sample_size=None,
    neutral_losses=None,
    chem_mods=None,
    compute_unused_metrics=None,
    scoring_model=None,
) -> DSConfig:
    # The kwarg names should match FLAT_DS_CONFIG_KEYS

    analysis_version = analysis_version or 1
    iso_params = _get_isotope_generation_from_metadata(metadata)
    default_adducts, charge, isocalc_sigma, instrument = iso_params
    default_scoring_model = 'v3_default' if analysis_version >= 3 else None

    return {
        'database_ids': moldb_ids,
        'analysis_version': analysis_version,
        'isotope_generation': {
            'adducts': adducts or default_adducts,
            'charge': charge,
            'isocalc_sigma': isocalc_sigma,
            'instrument': instrument,
            'n_peaks': n_peaks or 4,
            'neutral_losses': neutral_losses or [],
            'chem_mods': chem_mods or [],
        },
        'fdr': {
            'decoy_sample_size': decoy_sample_size or 20,
            'scoring_model': scoring_model or default_scoring_model,
        },
        'image_generation': {
            'ppm': ppm or 3,
            'n_levels': 30,
            'min_px': min_px or 1,
            'compute_unused_metrics': compute_unused_metrics or False,
        },
    }


def update_ds_config(old_config, metadata, **kwargs):
    """Updates dataset config.

    Extracts parameters from an existing ds_config, and uses them
    to generate a new ds_config with the provided changes.
    See FLAT_DS_CONFIG_KEYS for the list of allowed keys
    """
    assert all(key in FLAT_DS_CONFIG_KEYS for key in kwargs)

    isotope_generation = old_config.get('isotope_generation', {})
    fdr = old_config.get('fdr', {})
    image_generation = old_config.get('image_generation', {})
    old_vals = {
        'analysis_version': old_config.get('analysis_version'),
        'moldb_ids': old_config.get('database_ids'),
        'adducts': isotope_generation.get('adducts'),
        'n_peaks': isotope_generation.get('n_peaks'),
        'neutral_losses': isotope_generation.get('neutral_losses'),
        'chem_mods': isotope_generation.get('chem_mods'),
        'decoy_sample_size': fdr.get('decoy_sample_size'),
        'ppm': image_generation.get('ppm'),
        'min_px': image_generation.get('min_px'),
        'compute_unused_metrics': image_generation.get('compute_unused_metrics'),
        'scoring_model': fdr.get('scoring_model'),
    }

    for k, v in old_vals.items():
        if v is not None:
            kwargs.setdefault(k, v)

    return generate_ds_config(metadata, **kwargs)
