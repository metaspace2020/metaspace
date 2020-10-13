"""
Classes and functions for isotope image validation
"""
from collections import OrderedDict, defaultdict
from typing import (
    Tuple,
    Dict,
    Callable,
    Set,
    Iterator,
    List,
    Optional,
    Iterable,
    TypedDict,
)

import numpy as np
import pandas as pd
from pyImagingMSpec.image_measures import isotope_image_correlation, isotope_pattern_match
from cpyImagingMSpec import measure_of_chaos
from scipy.sparse import coo_matrix

from sm.engine.dataset import DSConfigImageGeneration

METRICS = OrderedDict(
    [
        ('chaos', 0.0),
        ('spatial', 0.0),
        ('spectral', 0.0),
        ('msm', 0.0),
        ('total_iso_ints', [0.0, 0.0, 0.0, 0.0]),
        ('min_iso_ints', [0.0, 0.0, 0.0, 0.0]),
        ('max_iso_ints', [0.0, 0.0, 0.0, 0.0]),
    ]
)


class MetricsDict(TypedDict):
    chaos: float
    spatial: float
    spectral: float
    msm: float
    total_iso_ints: List[float]
    min_iso_ints: List[float]
    max_iso_ints: List[float]


# (formula index, peak index, predicted intensity, image)
FormulaImageItem = Tuple[int, int, float, coo_matrix]
# (formula index, predicted intensities, images)
FormulaImageSet = Tuple[int, List[float], List[Optional[coo_matrix]]]
# (formula index, metrics, images)
# images isn't present for decoy ions
FormulaMetricSet = Tuple[int, MetricsDict, Optional[List[Optional[coo_matrix]]]]

ComputeMetricsFunc = Callable[[List[Optional[coo_matrix]], List[float]], MetricsDict]


def replace_nan(val, default=0):
    def replace(x):
        if not x or np.isinf(x) or np.isnan(x):
            return default

        return float(x)

    if isinstance(val, list):
        return [replace(x) for x in val]

    return replace(val)


def make_compute_image_metrics(
    sample_area_mask: np.ndarray, nrows: int, ncols: int, img_gen_config: DSConfigImageGeneration
) -> ComputeMetricsFunc:
    """Returns a function for computing formula images metrics

    Args
    -----
    sample_area_mask: ndarray[bool]
        mask for separating sampled pixels (True) from non-sampled (False)

    img_gen_config : dict
        isotope_generation section of the dataset config
    Returns
    -----
        function
    """
    empty_matrix = np.zeros((nrows, ncols))
    sample_area_mask_flat = sample_area_mask.flatten()

    def compute_metrics(iso_images_sparse, formula_ints):
        np.seterr(invalid='ignore')  # to ignore division by zero warnings

        doc = METRICS.copy()
        if iso_images_sparse:
            iso_imgs = [
                img.toarray() if img is not None else empty_matrix for img in iso_images_sparse
            ]

            iso_imgs_flat = [img.flatten()[sample_area_mask_flat] for img in iso_imgs]
            iso_imgs_flat = iso_imgs_flat[: len(formula_ints)]

            doc['total_iso_ints'] = [img.sum() for img in iso_imgs]
            doc['min_iso_ints'] = [img.min() for img in iso_imgs]
            doc['max_iso_ints'] = [img.max() for img in iso_imgs]

            doc['spectral'] = isotope_pattern_match(iso_imgs_flat, formula_ints)
            if doc['spectral'] > 0:

                doc['spatial'] = isotope_image_correlation(iso_imgs_flat, weights=formula_ints[1:])
                if doc['spatial'] > 0:

                    moc = measure_of_chaos(iso_imgs[0], img_gen_config.get('n_levels', 30))
                    doc['chaos'] = 0 if np.isclose(moc, 1.0) else moc
                    if doc['chaos'] > 0:

                        doc['msm'] = doc['chaos'] * doc['spatial'] * doc['spectral']
        return OrderedDict((k, replace_nan(v)) for k, v in doc.items())

    return compute_metrics


def iter_images_in_sets(
    formula_images_it: Iterable[FormulaImageItem], n_peaks: int
) -> Iterator[FormulaImageSet]:
    """Buffer semi-ordered images from formula_images_it and yield them in sets grouped by
    formula index. Formula indexes can come in any order, but for a given formula index
    it's assumed that the peaks are always received in order lowest to highest.

    Args:
        formula_images_it: Iterator over tuples of
            (formula index, peak index, formula intensity, image).
        n_peaks: Max number of isotopic peaks per formula
    """
    f_images_buffer: Dict[int, List[Optional[coo_matrix]]] = defaultdict(lambda: [None] * n_peaks)
    f_ints_buffer: Dict[int, List[float]] = defaultdict(lambda: [0.0] * n_peaks)

    for f_i, p_i, f_int, image in formula_images_it:
        if f_images_buffer[f_i][p_i] is None:
            f_images_buffer[f_i][p_i] = image
        else:
            f_images_buffer[f_i][p_i] += image
        f_ints_buffer[f_i][p_i] = f_int

        if p_i == n_peaks - 1:  # last formula image index
            f_images = f_images_buffer.pop(f_i)
            f_ints = f_ints_buffer.pop(f_i)
            yield f_i, f_ints, f_images

    # process formulas with len(peaks) < max_peaks and those that were cut to dataset max mz
    for f_i, f_images in f_images_buffer.items():
        f_ints = f_ints_buffer[f_i]
        yield f_i, f_ints, f_images


def complete_image_list(images, require_first=True):
    non_empty_image_n = sum(1 for img in images if img is not None)
    if non_empty_image_n == 0:
        return False

    if require_first:
        return images[0] is not None

    return True


def nullify_images_with_too_few_pixels(f_images, min_px):
    return [img if (img is not None and img.nnz >= min_px) else None for img in f_images]


def compute_and_filter_metrics(
    formula_image_set_it: Iterable[FormulaImageSet],
    compute_metrics: Callable,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
    min_px: int,
) -> Iterator[FormulaMetricSet]:
    """Compute isotope image metrics for each formula.

    Args:
        formula_image_set_it: Iterator over tuples of
            (formula index, peak index, formula intensity, image).
        compute_metrics: Metrics function.
        target_formula_inds: Indices of target ion formulas (non-decoy ion formulas).
        targeted_database_formula_inds: Indices of ion formulas
            that correspond to targeted databases.
        min_px: Minimum number of pixels each image should have.
    """
    for f_i, f_ints, f_images in formula_image_set_it:
        f_images = nullify_images_with_too_few_pixels(f_images, min_px)
        is_targeted = f_i in targeted_database_formula_inds
        if complete_image_list(f_images, require_first=not is_targeted):
            f_metrics = compute_metrics(f_images, f_ints)
            if f_metrics['msm'] > 0 or is_targeted:
                if f_i in target_formula_inds:
                    yield f_i, f_metrics, f_images
                else:
                    yield f_i, f_metrics, None


def collect_metrics_as_df(
    metrics_it: Iterable[FormulaMetricSet],
) -> Tuple[pd.DataFrame, Dict[int, List[Optional[coo_matrix]]]]:
    """Collects metrics and images into a single dataframe and dict of images
    """
    formula_metrics = {}
    formula_images = {}

    for f_i, f_metrics, f_images in metrics_it:
        formula_metrics[f_i] = f_metrics
        if f_images is not None:
            formula_images[f_i] = f_images

    if formula_metrics:
        formula_metrics_df = pd.DataFrame.from_dict(formula_metrics, orient='index')
    else:
        formula_metrics_df = pd.DataFrame(columns=list(METRICS.keys()))
    formula_metrics_df.index.name = 'formula_i'

    return formula_metrics_df, formula_images


def formula_image_metrics(
    formula_images_it: Iterable[FormulaImageItem],
    compute_metrics: ComputeMetricsFunc,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
    n_peaks: int,
    min_px: int,
) -> Tuple[pd.DataFrame, Dict]:
    formula_image_set_it = iter_images_in_sets(formula_images_it, n_peaks)
    metrics_it = compute_and_filter_metrics(
        formula_image_set_it,
        compute_metrics,
        target_formula_inds,
        targeted_database_formula_inds,
        min_px,
    )
    formula_metrics_df, formula_images = collect_metrics_as_df(metrics_it)
    return formula_metrics_df, formula_images
