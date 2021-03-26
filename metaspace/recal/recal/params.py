from typing import Literal, Union

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
        unaligned_sigma_1: float,
        aligned_sigma_1: float,
        limit_of_detection: float,
        min_mz: float,
        max_mz: float,
        n_recal_segms: int,
    ):
        self.instrument = instrument = normalize_instrument_type(instrument)
        self.rp_at_200 = rp_at_200
        self.unaligned_sigma_1 = unaligned_sigma_1
        self.aligned_sigma_1 = aligned_sigma_1
        self.limit_of_detection = limit_of_detection
        self.min_mz = min_mz
        self.max_mz = max_mz
        self.n_recal_segms = n_recal_segms

        if instrument == 'ft-icr':
            self.instrument_model = cpyMSpec.InstrumentModel('fticr', rp_at_200)
        self.instrument_model = cpyMSpec.InstrumentModel(instrument, rp_at_200)
