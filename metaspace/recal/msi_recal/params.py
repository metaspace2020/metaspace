from pathlib import Path
from pprint import pformat
from typing import Literal, Union, List

import cpyMSpec

INSTRUMENT_TYPES = ('orbitrap', 'ft-icr', 'tof')
InstrumentType = Union[Literal['orbitrap'], Literal['ft-icr'], Literal['tof']]

DEFAULT = object()


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
        instrument: str = 'orbitrap',
        source: str = 'maldi',
        polarity: Union[Literal['positive'], Literal['negative']] = 'positive',
        rp: float = 140000.0,
        base_mz: float = 200.0,
        peak_width_ppm: float = DEFAULT,
        jitter_ppm: float = 3.0,
        adducts: List[str] = DEFAULT,
        profile_mode: bool = False,
        db_paths: List[Union[Path, str]] = DEFAULT,
        transforms: List[List[str]] = DEFAULT,
    ):
        from msi_recal.math import ppm_to_sigma_1  # Avoid circular import

        self.instrument = instrument = normalize_instrument_type(instrument)
        self.rp = rp
        self.base_mz = base_mz
        if peak_width_ppm is DEFAULT:
            self.peak_width_ppm = 15 if profile_mode else 0
        else:
            self.peak_width_ppm = peak_width_ppm
        self.peak_width_sigma_1 = ppm_to_sigma_1(self.peak_width_ppm, instrument, base_mz)
        self.jitter_ppm = jitter_ppm
        self.jitter_sigma_1 = ppm_to_sigma_1(self.jitter_ppm, instrument, base_mz)

        if polarity.lower() == 'positive':
            self.charge = 1
            if adducts is DEFAULT:
                if source.lower() == 'maldi':
                    adducts = ['', '+H', '+Na', '+K']
                else:
                    adducts = ['', '+H', '+Na', '-Cl', '+NH4']
            if db_paths is DEFAULT:
                if source.lower() == 'maldi':
                    db_paths = ['core', 'dhb']
                else:
                    db_paths = ['core']
        else:
            self.charge = -1
            if adducts is DEFAULT:
                if source.lower() == 'maldi':
                    adducts = ['', '-H', '+Cl']
                else:
                    adducts = ['', '-H', '+Cl', '+HCO2']
            if db_paths is DEFAULT:
                if source.lower() == 'maldi':
                    db_paths = ['core', 'dan']
                else:
                    db_paths = ['core']

        self.adducts = adducts
        self.profile_mode = profile_mode

        self.db_paths = []
        all_db_paths = (Path(__file__).parent / 'dbs').glob('*.csv')
        for db in db_paths:
            if isinstance(db, Path):
                self.db_paths.append(db)
            else:
                matches = [p for p in all_db_paths if str(db) in p.name.lower()]
                self.db_paths.append(matches[0] if matches else db)

        if transforms is DEFAULT:
            transforms = [
                ['align_msiwarp', '5', '1', '0.2'],
                ['recal_ransac', '50'],
                ['recal_msiwarp', '20', '4', '0.1'],
            ]
        self.transforms = transforms

        if instrument == 'ft-icr':
            self.instrument_model = cpyMSpec.InstrumentModel('fticr', rp, base_mz)
        else:
            self.instrument_model = cpyMSpec.InstrumentModel(instrument, rp, base_mz)

    def __repr__(self):
        return 'RecalParams ' + pformat(self.__dict__, sort_dicts=False)
