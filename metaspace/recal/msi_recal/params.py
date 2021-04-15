from pathlib import Path
from pprint import pformat
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
        rp: float,
        base_mz: float,
        jitter_sigma_1: float,
        charge: int,
        db_paths: List[Path],
        adducts: List[str],
        passes: List[List[str]],
    ):
        self.instrument = instrument = normalize_instrument_type(instrument)
        self.rp = rp
        self.base_mz = base_mz
        self.jitter_sigma_1 = jitter_sigma_1
        self.charge = charge
        self.db_paths = db_paths
        self.adducts = adducts
        self.transforms = passes

        if instrument == 'ft-icr':
            self.instrument_model = cpyMSpec.InstrumentModel('fticr', rp, base_mz)
        self.instrument_model = cpyMSpec.InstrumentModel(instrument, rp, base_mz)

    def __repr__(self):
        return 'RecalParams ' + pformat(self.__dict__, sort_dicts=False)


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
        rp=140000,
        base_mz=200,
        jitter_sigma_1=ppm_to_sigma_1(2, instrument),
        charge=charge,
        db_paths=db_paths,
        adducts=adducts,
        passes=[
            ['align_msiwarp', '20', '1', '30'],
            ['recal_ransac', '500'],
            ['recal_msiwarp', '20', '4', '100'],
        ],
    )
