from typing import List, Tuple

import numpy as np

DEFAULT_SEED = 0


def sample_spectrum_indices(
    n_spectra: int, sample_size: int, seed: int = DEFAULT_SEED
) -> np.ndarray:
    """One random spectrum from each of ``sample_size`` equal strata of the acquisition order,
    so the sample is spread across the run and identical for repeated runs."""
    if n_spectra <= sample_size:
        return np.arange(n_spectra)
    edges = np.linspace(0, n_spectra, sample_size + 1).astype(np.int64)
    return np.random.RandomState(seed).randint(edges[:-1], edges[1:])


def read_raw_spectra(reader, storage, indices) -> List[Tuple[np.ndarray, np.ndarray]]:
    """Unprocessed (m/z, intensity) arrays for the given spectra, zero-intensity peaks included."""
    return [(mzs, ints) for _, mzs, ints in reader.read_raw_spectra(storage, indices)]
