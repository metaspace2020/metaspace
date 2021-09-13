from typing import overload, Optional, List, Tuple

import cpyMSpec
import numpy as np
import pandas as pd

from msi_recal.params import AnalyzerType


def weighted_stddev(values, weights):
    average = np.average(values, weights=weights)
    stddev = np.sqrt(np.average((values - average) ** 2, weights=weights))
    return average, stddev


@overload
def mass_accuracy_bounds(mzs: np.ndarray, analyzer: AnalyzerType, sigma_1: float) -> np.ndarray:
    ...


@overload
def mass_accuracy_bounds(mzs: pd.Series, analyzer: AnalyzerType, sigma_1: float) -> pd.Series:
    ...


@overload
def mass_accuracy_bounds(mzs: float, analyzer: AnalyzerType, sigma_1: float) -> float:
    ...


def mass_accuracy_bounds(mzs, analyzer: AnalyzerType, sigma_1: float):
    """Returns upper and lower mass boundsm, scaled based on m/z, analyzer and sigma_1"""
    if analyzer == 'ft-icr':
        half_width = mzs ** 2 * sigma_1
    elif analyzer == 'orbitrap':
        half_width = mzs ** 1.5 * sigma_1
    else:
        half_width = mzs * sigma_1

    lower = mzs - half_width
    upper = mzs + half_width
    return lower, upper


def mass_accuracy_bound_indices(
    mzs: np.ndarray, search_mzs: np.ndarray, analyzer: AnalyzerType, sigma_1: float
):
    """Note that mzs must be sorted, but this isn't asserted"""
    lower_mz, upper_mz = mass_accuracy_bounds(search_mzs, analyzer, sigma_1)
    lower_idx = np.searchsorted(mzs, lower_mz, 'l')
    upper_idx = np.searchsorted(mzs, upper_mz, 'r')
    return np.vstack([lower_idx, upper_idx])


@overload
def peak_width(mzs: np.ndarray, analyzer: AnalyzerType, sigma_1: float) -> np.ndarray:
    ...


@overload
def peak_width(mzs: pd.Series, analyzer: AnalyzerType, sigma_1: float) -> pd.Series:
    ...


@overload
def peak_width(mzs: float, analyzer: AnalyzerType, sigma_1: float) -> float:
    ...


def peak_width(mzs, analyzer: AnalyzerType, sigma_1: float):
    lower, upper = mass_accuracy_bounds(mzs, analyzer, sigma_1)
    return upper - lower


def ppm_to_sigma_1(ppm: float, analyzer: AnalyzerType, at_mz=200):
    """
    Converts a ppm value at a given m/z to a sigma_1 value for use with MSIWarp.
    Effectively METASPACE and MSIWarp treat the two values the same way - as an m/z tolerance.
    However, ppm is proportional to a base m/z value (usually 200), whereas sigma_1 is an absolute
    value of Daltons measured at 1 Da.
    """
    if analyzer == 'orbitrap':
        return (at_mz * ppm / 1e6) / (at_mz ** 1.5)
    if analyzer == 'ft-icr':
        return (at_mz * ppm / 1e6) / (at_mz ** 2)
    return ppm / 1e6


def sigma_1_to_ppm(sigma_1: float, analyzer: AnalyzerType, at_mz=200):
    """Inverse of ppm_to_sigma_1"""
    if analyzer == 'orbitrap':
        return sigma_1 * 1e6 * at_mz ** 0.5
    if analyzer == 'ft-icr':
        return sigma_1 * 1e6 * at_mz
    return sigma_1 * 1e6


def get_centroid_peaks(
    formula: str,
    adduct: Optional[str],
    charge: int,
    min_abundance: float,
    instrument_model: cpyMSpec.InstrumentModel,
) -> List[Tuple[float, float]]:
    if adduct and adduct not in ('[M]+', '[M]-'):
        formula += adduct
    iso_pattern = cpyMSpec.isotopePattern(formula)
    if charge:
        iso_pattern.addCharge(charge)

    try:
        centr = iso_pattern.centroids(instrument_model, min_abundance=min_abundance)
        return sorted(zip(centr.masses, centr.intensities), key=lambda pair: -pair[1])
    except Exception as ex:
        # iso_pattern.centroids may raise an exception:
        #   Exception: b'the result contains no peaks, make min_abundance lower!'
        # If this happens, just return the most intense uncentroided theoretical peak.
        if 'min_abundance' in str(ex):
            return [(iso_pattern.masses[np.argmax(iso_pattern.intensities)], 1.0)]
        if 'total number of' in str(ex) and 'less than zero' in str(ex):
            # Invalid molecule due to adduct removing non-existent elements
            raise Exception(f'Adduct could not be applied: {formula}{adduct}')
        raise


def get_mono_mz(formula: str, adduct: Optional[str], charge: int):
    if adduct and adduct not in ('[M]+', '[M]-'):
        formula += adduct
    iso_pattern = cpyMSpec.isotopePattern(formula)
    if charge:
        iso_pattern.addCharge(charge)

    return iso_pattern.masses[np.argmax(iso_pattern.intensities)]


def is_valid_formula_adduct(formula: str, adduct: str):
    if adduct and adduct not in ('[M]+', '[M]-'):
        formula += adduct
    try:
        cpyMSpec.isotopePattern(formula)
        return True
    except Exception:
        return False
