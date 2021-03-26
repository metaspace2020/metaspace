from typing import overload

import cpyMSpec
import numpy as np
import pandas as pd

from recal.params import InstrumentType


def weighted_stddev(values, weights):
    average = np.average(values, weights=weights)
    stddev = np.sqrt(np.average((values - average) ** 2, weights=weights))
    return average, stddev


@overload
def mass_accuracy_bounds(mzs: np.array, instrument: InstrumentType, sigma_1: float) -> np.array:
    ...


@overload
def mass_accuracy_bounds(mzs: pd.Series, instrument: InstrumentType, sigma_1: float) -> pd.Series:
    ...


@overload
def mass_accuracy_bounds(mzs: float, instrument: InstrumentType, sigma_1: float) -> float:
    ...


def mass_accuracy_bounds(mzs, instrument: InstrumentType, sigma_1: float):
    """Returns upper and lower mass boundsm, scaled based on m/z, instrument and sigma_1"""
    if instrument == 'ft-icr':
        half_width = mzs * sigma_1 * 1e-6
    elif instrument == 'orbitrap':
        half_width = np.sqrt(mzs) * sigma_1
    else:
        half_width = np.ones_like(mzs) * sigma_1

    lower = mzs - half_width
    upper = mzs + half_width
    return lower, upper


@overload
def peak_width(mzs: np.array, instrument: InstrumentType, sigma_1: float) -> np.array:
    ...


@overload
def peak_width(mzs: pd.Series, instrument: InstrumentType, sigma_1: float) -> pd.Series:
    ...


@overload
def peak_width(mzs: float, instrument: InstrumentType, sigma_1: float) -> float:
    ...


def peak_width(mzs, instrument: InstrumentType, sigma_1: float):
    lower, upper = mass_accuracy_bounds(mzs, instrument, sigma_1)
    return upper - lower


def ppm_to_sigma_1(ppm: float, instrument: InstrumentType, at_mz=200):
    """
    Converts a ppm value at a given m/z to a sigma_1 value for use with MSIWarp.
    Effectively METASPACE and MSIWarp treat the two values the same way - as an m/z tolerance.
    However, ppm is proportional to a base m/z value (usually 200), whereas sigma_1 is an absolute
    value of Daltons measured at 1 Da.
    """
    if instrument == 'orbitrap':
        return (ppm * at_mz / 1e6) / (at_mz ** 1.5)
    if instrument == 'ft-icr':
        return (ppm * at_mz / 1e6) / (at_mz ** 2)
    return ppm / 1e6


def sigma_1_to_ppm(sigma_1: float, instrument: InstrumentType, at_mz=200):
    """Inverse of ppm_to_sigma_1"""
    if instrument == 'orbitrap':
        return sigma_1 * 1e6 * at_mz ** 0.5
    if instrument == 'ft-icr':
        return sigma_1 * 1e6 * at_mz
    return sigma_1 * 1e6


def get_centroid_peaks(
    formula: str,
    adduct: str,
    charge: int,
    min_abundance: float,
    instrument_model: cpyMSpec.InstrumentModel,
):
    iso_pattern = cpyMSpec.isotopePattern(formula + adduct)
    if charge:
        iso_pattern.addCharge(charge)

    try:
        centr = iso_pattern.centroids(instrument_model, min_abundance=min_abundance)
        order = np.argsort(centr.intensities)[::-1]
        return list(zip(np.array(centr.masses)[order], np.array(centr.intensities)[order]))
    except Exception as ex:
        if 'min_abundance' not in str(ex):
            raise
        return [(iso_pattern.masses[0], 1)]
