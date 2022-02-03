from typing import TypedDict, List, Optional


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
    scoring_model: Optional[str]


class DSConfigImageGeneration(TypedDict):
    ppm: float
    n_levels: int
    min_px: int
    # Disables an optimization where expensive metrics are skipped if cheap metrics already indicate
    # the annotation will be rejected. Only useful for collecting data for model training.
    compute_unused_metrics: Optional[bool]


class DSConfig(TypedDict):
    database_ids: List[int]
    analysis_version: int
    isotope_generation: DSConfigIsotopeGeneration
    fdr: DSConfigFDR
    image_generation: DSConfigImageGeneration
