from pathlib import Path
from typing import Literal, Union, List

import cpyMSpec

INSTRUMENT_TYPES = ('orbitrap', 'ft-icr', 'tof')
InstrumentType = Union[Literal['orbitrap'], Literal['ft-icr'], Literal['tof']]


def normalize_instrument_type(instrument) -> InstrumentType:
    """Detects instrument type from a string and returns an MSIWarp-compatible instrument string"""
    instrument = (instrument or '').lower()
    if 'orbitrap' in instrument:
        return 'orbitrap'
    if any(phrase in instrument for phrase in ['fticr', 'ft-icr', 'ftms', 'ft-ms']):
        return 'ft-icr'
    return 'tof'


class RecalParams:
    def __init__(
        self,
        instrument: str,
        rp_at_200: float,
        align_sigma_1: float,
        jitter_sigma_1: float,
        recal_sigma_1: float,
        mx_recal_sigma_1: float,
        charge: int,
        n_mx_recal_segms: int,
        n_mx_recal_steps: int,
        n_mx_align_steps: int,
        db_paths: List[Path],
        adducts: List[str],
        passes: List[str],
    ):
        self.instrument = instrument = normalize_instrument_type(instrument)
        self.rp_at_200 = rp_at_200
        self.align_sigma_1 = align_sigma_1
        self.jitter_sigma_1 = jitter_sigma_1
        self.recal_sigma_1 = recal_sigma_1
        self.mx_recal_sigma_1 = mx_recal_sigma_1
        self.charge = charge
        self.n_mx_recal_segms = n_mx_recal_segms
        self.n_mx_recal_steps = n_mx_recal_steps
        self.n_mx_align_steps = n_mx_align_steps
        self.db_paths = db_paths
        self.adducts = adducts
        self.passes = passes
        assert all(
            p in ('align_msiwarp', 'align_ransac', 'recal_msiwarp', 'recal_ransac') for p in passes
        )

        if instrument == 'ft-icr':
            self.instrument_model = cpyMSpec.InstrumentModel('fticr', rp_at_200)
        self.instrument_model = cpyMSpec.InstrumentModel(instrument, rp_at_200)


def default_params(polarity: str = 'positive'):
    from msi_recal.math import ppm_to_sigma_1  # Avoid circular import

    all_db_paths = (Path(__file__).parent / 'dbs').glob('*.csv')
    if polarity.lower() == 'positive':
        charge = 1
        adducts = ['', '+H', '+Na', '+K']
        db_paths = [p for p in all_db_paths if any(s in str(p).lower() for s in ['core', 'dhb'])]
    else:
        charge = -1
        adducts = ['', '-H', '+Cl']
        db_paths = [p for p in all_db_paths if any(s in str(p).lower() for s in ['core', 'dan'])]
    instrument: InstrumentType = 'orbitrap'
    return RecalParams(
        instrument=instrument,
        rp_at_200=140000,
        align_sigma_1=ppm_to_sigma_1(20, instrument),
        jitter_sigma_1=ppm_to_sigma_1(2, instrument),
        recal_sigma_1=ppm_to_sigma_1(500, instrument),
        mx_recal_sigma_1=ppm_to_sigma_1(20, instrument),
        charge=charge,
        n_mx_recal_segms=4,
        n_mx_recal_steps=100,
        n_mx_align_steps=30,
        db_paths=db_paths,
        adducts=adducts,
        passes=['align_msiwarp', 'recal_ransac', 'recal_msiwarp'],
    )
