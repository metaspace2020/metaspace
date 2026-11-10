import os
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
from pyimzml.ImzMLWriter import ImzMLWriter
from scipy.sparse import coo_matrix

N_PEAKS = 4
ISOTOPE_SPACING = 1.00335
THEO_INTS = np.array([100.0, 60.0, 20.0, 5.0])


def make_formulas(n: int, seed: int = 0) -> List[str]:
    specials = [
        'C6H12O6',
        'C9H11NO3S',
        'C5H10NO5P',
        'C6H5BrO',
        'C7H7Cl',
        'C6H5F',
        'H12O6Cx6',
        'C45H78O6P',
        'C80H150O10',
    ]
    result = set(specials[:n])
    rng = np.random.default_rng(seed)
    while len(result) < n:
        c = int(rng.integers(3, 90))
        h = int(rng.integers(c, 2 * c + 3))
        parts = f'C{c}H{h}'
        for element, prob, high in [
            ('Br', 0.05, 2),
            ('Cl', 0.08, 3),
            ('F', 0.05, 4),
            ('N', 0.4, 5),
            ('O', 0.8, 20),
            ('P', 0.1, 2),
            ('S', 0.15, 3),
        ]:
            if rng.random() < prob:
                parts += f'{element}{int(rng.integers(1, high + 1))}'
        result.add(parts)
    return sorted(result)


@dataclass
class ImageCase:
    name: str
    images: List[coo_matrix]
    flat: np.ndarray
    n_spectra: int
    theo_ints: np.ndarray
    theo_mzs: np.ndarray
    mz_images: List[coo_matrix]


def _to_coo(dense: np.ndarray) -> coo_matrix:
    return coo_matrix(dense)


def _blob(shape, center, sigma):
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    return np.exp(-(((ys - center[0]) ** 2 + (xs - center[1]) ** 2) / (2 * sigma ** 2)))


def _flatten(images: List[coo_matrix]) -> np.ndarray:
    return np.stack([img.toarray().ravel() for img in images])


def _build_case(name, rng, shape, pattern, zero_peaks=(), duplicate=False) -> ImageCase:
    theo_mzs = 150.0 + rng.random() * 600.0 + ISOTOPE_SPACING * np.arange(N_PEAKS)
    images, mz_images = [], []
    for k in range(N_PEAKS):
        if k in zero_peaks:
            images.append(coo_matrix(shape))
            mz_images.append(coo_matrix(shape))
            continue
        noise = 1.0 + 0.1 * rng.standard_normal(shape)
        dense = np.where(pattern > 0, pattern * noise * THEO_INTS[k], 0.0)
        dense = np.clip(dense, 0, None)
        img = _to_coo(dense)
        if duplicate and k == 0:
            half = coo_matrix((img.data[::2] * 0.5, (img.row[::2], img.col[::2])), shape=img.shape)
            img = coo_matrix(
                (
                    np.concatenate([img.data, half.data]),
                    (np.concatenate([img.row, half.row]), np.concatenate([img.col, half.col])),
                ),
                shape=img.shape,
            )
        images.append(img)
        mz_data = theo_mzs[k] * (1.0 + 1e-6 * rng.standard_normal(img.nnz))
        mz_images.append(coo_matrix((mz_data, (img.row, img.col)), shape=img.shape))
    return ImageCase(
        name=name,
        images=images,
        flat=_flatten(images),
        n_spectra=shape[0] * shape[1],
        theo_ints=THEO_INTS.copy(),
        theo_mzs=theo_mzs,
        mz_images=mz_images,
    )


def make_image_cases(seed: int = 0) -> List[ImageCase]:
    rng = np.random.default_rng(seed)
    shape = (24, 30)
    dense_pattern = 0.3 + _blob(shape, (12, 15), 8.0) + 0.2 * rng.random(shape)
    blob_pattern = np.where(_blob(shape, (8, 20), 2.5) > 0.2, _blob(shape, (8, 20), 2.5), 0.0)
    single = np.zeros((10, 10))
    single[4, 5] = 1.0
    cases = [
        _build_case('dense', rng, shape, dense_pattern),
        _build_case('sparse_blob', rng, shape, blob_pattern),
        _build_case('single_pixel', rng, single.shape, single),
        _build_case('all_zero_peak', rng, shape, dense_pattern, zero_peaks=(1,)),
        _build_case('missing_m3', rng, shape, blob_pattern + 0.0, zero_peaks=(3,)),
        _build_case('duplicate_coords', rng, shape, blob_pattern + 0.0, duplicate=True),
    ]
    return cases


def make_dense_arrays(seed: int = 0) -> List[Tuple[str, np.ndarray]]:
    rng = np.random.default_rng(seed)
    shape = (30, 40)
    return [
        ('blob', _blob(shape, (15, 20), 6.0) * 100.0),
        ('noisy', rng.random(shape) * 50.0),
        ('rings', 50.0 + 50.0 * np.sin(np.hypot(*np.mgrid[0:30, 0:40]) / 2.0)),
        ('all_zero', np.zeros(shape)),
        ('constant', np.full(shape, 7.0)),
    ]


def make_spectrum_set(
    seed: int = 0, n_spectra: int = 12, n_peaks: int = 60
) -> Tuple[List[np.ndarray], List[np.ndarray], List[Tuple[int, int, int]]]:
    rng = np.random.default_rng(seed)
    base_mzs = np.sort(100.0 + rng.random(n_peaks) * 900.0)
    mzs = [base_mzs.copy() for _ in range(n_spectra)]
    ints = [rng.random(n_peaks) * 1000.0 for _ in range(n_spectra)]
    ints[0][::7] = 0.0
    width = 4
    coords = [(i % width + 1, i // width + 1, 1) for i in range(n_spectra)]
    return mzs, ints, coords


def write_imzml(
    path: str, mzs, ints, coords, mode: str = 'processed', mz_dtype=np.float32, polarity=None
) -> Tuple[str, str]:
    with ImzMLWriter(path, mz_dtype=mz_dtype, mode=mode, polarity=polarity) as writer:
        for sp_mzs, sp_ints, coord in zip(mzs, ints, coords):
            writer.addSpectrum(sp_mzs, sp_ints, coord)
    return path, os.path.splitext(path)[0] + '.ibd'


def make_ds_config(
    analysis_version: int = 1,
    instrument: str = 'TOF',
    charge: int = 1,
    sigma: float = 0.000619,
    ppm: float = 3,
    n_peaks: int = N_PEAKS,
):
    from copy import deepcopy

    from tests.utils import TEST_DS_CONFIG

    config = deepcopy(TEST_DS_CONFIG)
    config['analysis_version'] = analysis_version
    config['isotope_generation'].update(
        instrument=instrument, charge=charge, isocalc_sigma=sigma, n_peaks=n_peaks
    )
    config['image_generation']['ppm'] = ppm
    return config


PIPELINE_DECOYS = ['+Be', '+Al']
PIPELINE_FORMULAS = [f'C{i}H{2 + 2 * i}O' for i in range(1, 11)]
PIPELINE_COORDS = list(
    zip([2, 3, 4, 5, 2, 3, 4, 5, 2, 3, 2, 3], [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5])
)


def make_pipeline_spectrum(ds_config):
    from itertools import product

    from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper

    isocalc = IsocalcWrapper(ds_config)
    formulas = [
        *PIPELINE_FORMULAS[:2],
        *(f + d for f, d in product(PIPELINE_FORMULAS[:3], PIPELINE_DECOYS)),
        *PIPELINE_FORMULAS[2:],
    ]
    mzs, ints = [], []
    for i, formula in enumerate(formulas):
        formula_mzs, formula_ints = isocalc.centroids(formula)
        mzs.extend(formula_mzs)
        ints.extend(formula_ints * (1 - i / len(formulas)) ** np.arange(len(formula_ints)))
    order = np.argsort(mzs)
    return np.array(mzs)[order], np.array(ints)[order]


def write_pipeline_imzml(directory: str, ds_config) -> Tuple[str, str]:
    mzs, ints = make_pipeline_spectrum(ds_config)
    coords = [(x, y, 1) for x, y in PIPELINE_COORDS]
    return write_imzml(
        f'{directory}/test.imzML',
        [mzs] * len(coords),
        [ints * x * y for x, y, _ in coords],
        coords,
        mode='processed',
        mz_dtype=np.float64,
        polarity='positive',
    )


def write_pipeline_moldb(directory: str) -> str:
    import pandas as pd

    path = f'{directory}/db.tsv'
    pd.DataFrame(
        {
            'id': [f'id_{i}' for i in range(len(PIPELINE_FORMULAS))],
            'name': [f'name_{i}' for i in range(len(PIPELINE_FORMULAS))],
            'formula': PIPELINE_FORMULAS,
        }
    ).to_csv(path, sep='\t', index=False)
    return path
