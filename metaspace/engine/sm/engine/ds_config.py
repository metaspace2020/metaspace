from typing import TypedDict, List


class DSConfigIsotopeGeneration(TypedDict):
    adducts: List[str]
    charge: int
    isocalc_sigma: float
    instrument: str
    n_peaks: int
    neutral_losses: List[str]
    chem_mods: List[str]


class DSConfigFDR(TypedDict):
    decoy_sample_size: int


class DSConfigImageGeneration(TypedDict):
    ppm: int
    n_levels: int
    min_px: int


class DSConfig(TypedDict):
    database_ids: List[int]
    analysis_version: int
    isotope_generation: DSConfigIsotopeGeneration
    fdr: DSConfigFDR
    image_generation: DSConfigImageGeneration
