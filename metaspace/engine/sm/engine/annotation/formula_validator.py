"""
Classes and functions for isotope image validation
"""
import time
from contextlib import contextmanager
from dataclasses import dataclass, field, fields
from typing import (
    Tuple,
    Dict,
    Callable,
    Set,
    Iterator,
    List,
    Optional,
    Iterable,
    Union,
)

import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix

from sm.engine.annotation.imzml_reader import ImzMLReader
from sm.engine.annotation.metrics import spatial_metric, chaos_metric, spectral_metric, mass_metrics
from sm.engine.ds_config import DSConfig


@dataclass()
class Metrics:
    formula_i: int = 0

    # These are left as None if they're skipped due to early rejection optimizations
    # Use the compute_unused_metrics config value to force them to be computed
    chaos: Optional[float] = None
    spatial: Optional[float] = None
    spectral: Optional[float] = None
    msm: float = 0.0

    # Per-image metrics
    total_iso_ints: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))
    min_iso_ints: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))
    max_iso_ints: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))

    # Mass metrics
    # Most of these are float32 because it's enough for humans and reduces storage size.
    # Float32 is accurate to 7 digits, or 0.059ppm (worst-case), and virtually no instruments have
    # that degree of mass accuracy.
    # However, temporary values of theo_mz and mz_mean are kept as float64 because once averaged
    # across all pixels in an image, the mass accuracy may surpass 0.059ppm, and mz_err_abs and
    # mz_err_rel can theoretically benefit from the higher precision.
    mz_mean: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))
    mz_stddev: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))
    mz_err_abs: float = 0.0
    mz_err_rel: float = 0.0

    # Theoretical mass/intensity values. These don't contribute to the score and are only preserved
    # for ease of display/analysis. Older versions did not store these fields.
    theo_mz: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))
    theo_ints: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float32))

    # Timing fields (in nanoseconds)
    # Uncomment these and the usages of "benchmark" in compute_metrics to get the timings saved in
    # the FDR diagnostic.
    # t_overall: int = 0
    # t_chaos: int = 0
    # t_spatial: int = 0
    # t_spectral: int = 0


# Intensity metrics
@dataclass()
class FormulaImageItem:
    """Holds the images and theoretical mz/intensity for one peak from one dataset segment.
    Needed for the Spark implementation's m/z-ordered iteration of images, as one image set may be
    spread across multiple dataset segments.
    """

    formula_i: int
    peak_i: int
    theo_mz: float
    theo_int: float
    may_be_split: bool
    image: Optional[coo_matrix]
    mz_image: Optional[coo_matrix]  # mz_images' pixels must be in the same order as images' pixels


EMPTY_METRICS_DF = pd.DataFrame(columns=[f.name for f in fields(Metrics)])


@dataclass()
class FormulaImageSet:
    formula_i: int
    is_target: bool
    targeted: bool
    # NOTE: On the Spark codepath, centroids outside of the mass range of the dataset are unlikely
    # to be included in theo_mzs/theo_ints
    theo_mzs: np.ndarray
    theo_ints: np.ndarray
    images: List[Optional[coo_matrix]]
    # mz_images' pixels must be in the same order as images' pixels
    # NOTE: mz_images should generally never be converted to a dense array, because all the built-in
    # methods for converting sparse matrices to dense arrays SUM values if one pixel has multiple
    # values, whereas m/zs need to be averaged when combined.
    mz_images: List[Optional[coo_matrix]]


# (formula index, metrics, images)
# images isn't present for decoy ions
FormulaMetricSet = Tuple[int, Metrics, Optional[List[Optional[coo_matrix]]]]

ComputeMetricsFunc = Callable[[FormulaImageSet], Metrics]


def make_compute_image_metrics(
    imzml_reader: ImzMLReader, ds_config: DSConfig
) -> ComputeMetricsFunc:

    analysis_version = ds_config.get('analysis_version', 1)
    img_gen_config = ds_config['image_generation']
    n_levels = img_gen_config.get('n_levels', 30)
    min_px = img_gen_config.get('min_px', 1)
    compute_unused_metrics = img_gen_config.get('compute_unused_metrics', False)

    sample_area_mask = imzml_reader.mask
    n_spectra = np.count_nonzero(sample_area_mask)
    empty_matrix = np.zeros(sample_area_mask.shape, dtype=np.float32)
    sample_area_mask_flat = sample_area_mask.flatten()

    def compute_metrics(image_set: FormulaImageSet):
        # pylint: disable=unused-variable  # benchmark is used in commented-out dev code
        @contextmanager
        def benchmark(attr):
            start = time.time_ns()
            yield
            setattr(doc, 't_' + attr, time.time_ns() - start)

        # with benchmark('overall'):

        iso_imgs = [img.toarray() if img is not None else empty_matrix for img in image_set.images]
        iso_imgs_flat = np.array([img.flatten()[sample_area_mask_flat] for img in iso_imgs])

        doc = Metrics(formula_i=image_set.formula_i)

        doc.theo_mz = np.float32(image_set.theo_mzs)
        doc.theo_ints = np.float32(image_set.theo_ints)

        # Some pixels in images have values of infinity or np.nan.
        # JSON does not support such values, so we replace them with the max possible val and zero
        doc.total_iso_ints = np.nan_to_num(np.float32([img.sum() for img in iso_imgs_flat]))
        doc.min_iso_ints = np.nan_to_num(np.float32([img.min(initial=0) for img in iso_imgs_flat]))
        doc.max_iso_ints = np.nan_to_num(np.float32([img.max(initial=0) for img in iso_imgs_flat]))

        mz_mean, mz_stddev, mz_err_abs, mz_err_rel = mass_metrics(
            image_set.images, image_set.mz_images, image_set.theo_mzs, image_set.theo_ints
        )
        doc.mz_mean = np.nan_to_num(mz_mean)
        doc.mz_stddev = np.nan_to_num(mz_stddev)
        doc.mz_err_abs = np.nan_to_num(mz_err_abs)
        doc.mz_err_rel = np.nan_to_num(mz_err_rel)

        # For non-targeted databases, image sets that don't have at least 2 images will
        is_complete_set = (
            image_set.images[0] is not None and image_set.images[0].nnz >= min_px
        ) and any(True for i in image_set.images[1:] if i is not None and i.nnz >= min_px)
        calc_all = image_set.is_target or image_set.targeted or compute_unused_metrics

        if is_complete_set or calc_all:
            # with benchmark('spectral'):
            doc.spectral = spectral_metric(iso_imgs_flat, image_set.theo_ints)
            if (doc.spectral or 0.0) > 0.0 or calc_all:
                # Keep the old spatial implementation in v1 to keep compatibility with old results
                # But prefer the new implementation as it's faster and only differs due to floating
                # point imprecision.
                v1_spatial = analysis_version == 1
                # with benchmark('spatial'):
                doc.spatial = spatial_metric(
                    iso_imgs_flat, n_spectra, image_set.theo_ints, v1_impl=v1_spatial
                )
                if (doc.spatial or 0.0) > 0.0 or calc_all:
                    # with benchmark('chaos'):
                    doc.chaos = chaos_metric(iso_imgs[0], n_levels)

        doc.msm = (doc.chaos or 0.0) * (doc.spatial or 0.0) * (doc.spectral or 0.0)

        return doc

    return compute_metrics


def concat_coo_matrices(*mats: coo_matrix):
    """Normally adding two coo_matrices together results in a csr_matrix being returned.
    To keep everything in coo_matrix format, it's necessary to manually concatenate the internal
    arrays when merging two matrices. This method doesn't sum values for duplicated coordinates.
    """

    return coo_matrix(
        (
            np.concatenate([m.data for m in mats]),
            (np.concatenate([m.row for m in mats]), np.concatenate([m.col for m in mats])),
        ),
        shape=mats[0].shape,
        copy=False,
    )


def mask_coo_matrix(mat: coo_matrix, mask: Union[np.array, slice]):
    return coo_matrix((mat.data[mask], (mat.row[mask], mat.col[mask])), shape=mat.shape)


def iter_images_in_sets(
    formula_images_it: Iterable[FormulaImageItem],
    n_peaks: int,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
) -> Iterator[FormulaImageSet]:
    """Buffer semi-ordered images from formula_images_it and yield them in sets grouped by
    formula index. Formula indexes can come in any order, but for a given formula index
    it's assumed that the peaks are always received in order lowest to highest.

    Args:
        formula_images_it: Iterator over FormulaImageItems
        n_peaks: Max number of isotopic peaks per formula
        target_formula_inds: Set of formula_inds that are target molecules
        targeted_database_formula_inds: Set of formula_inds that are molecules in targeted databases
    """
    image_set_buffer: Dict[int, FormulaImageSet] = {}
    yielded_formula_is = set()

    for image_item in formula_images_it:
        if image_item.formula_i not in image_set_buffer:
            assert image_item.formula_i not in yielded_formula_is, (
                'Images already dispatched for this formula. This means there\'s probably a bug '
                'in the way that formula_imager handles images that span multiple DS segments.'
            )
            image_set_buffer[image_item.formula_i] = FormulaImageSet(
                formula_i=image_item.formula_i,
                is_target=image_item.formula_i in target_formula_inds,
                targeted=image_item.formula_i in targeted_database_formula_inds,
                theo_mzs=np.zeros(n_peaks),
                theo_ints=np.zeros(n_peaks),
                images=[None] * n_peaks,
                mz_images=[None] * n_peaks,
            )

        image_set = image_set_buffer[image_item.formula_i]
        p_i = image_item.peak_i
        image_set.theo_mzs[p_i] = image_item.theo_mz
        image_set.theo_ints[p_i] = image_item.theo_int

        if image_set.images[p_i] is None:
            image_set.images[p_i] = image_item.image
            image_set.mz_images[p_i] = image_item.mz_image
        elif image_item.image is not None:
            image_set.images[p_i] = concat_coo_matrices(image_set.images[p_i], image_item.image)
            image_set.mz_images[p_i] = concat_coo_matrices(
                image_set.mz_images[p_i], image_item.mz_image
            )

        # If all images have been received for this formula, yield it
        if p_i == n_peaks - 1 and not image_item.may_be_split:
            yielded_formula_is.add(image_item.formula_i)
            yield image_set_buffer.pop(image_item.formula_i)

    # process formulas with len(peaks) < max_peaks and those that were cut to dataset max mz
    yield from image_set_buffer.values()


def compute_and_filter_metrics(
    formula_image_set_it: Iterable[FormulaImageSet],
    compute_metrics: Callable,
    min_px: int,
    compute_unused_metrics: bool,
) -> Iterator[FormulaMetricSet]:
    """Compute isotope image metrics for each formula.

    Args:
        formula_image_set_it: Iterator over tuples of
            (formula index, peak index, formula intensity, image).
        compute_metrics: Metrics function.
        compute_unused_metrics: Used to force all metrics to be added
        min_px: Minimum number of pixels each image should have.
    """
    for image_set in formula_image_set_it:
        for i, img in enumerate(image_set.images):
            if img is not None and img.nnz < min_px:
                image_set.images[i] = None
                image_set.mz_images[i] = None

        f_metrics = compute_metrics(image_set)
        if f_metrics.msm > 0 or image_set.targeted or compute_unused_metrics:
            if image_set.is_target:
                yield image_set.formula_i, f_metrics, image_set.images
            else:
                yield image_set.formula_i, f_metrics, None


def collect_metrics_as_df(
    metrics_it: Iterable[FormulaMetricSet],
) -> Tuple[pd.DataFrame, Dict[int, List[Optional[coo_matrix]]]]:
    """Collects metrics and images into a single dataframe and dict of images"""
    formula_metrics = []
    formula_images = {}

    for f_i, f_metrics, f_images in metrics_it:
        formula_metrics.append(f_metrics)
        if f_images is not None:
            formula_images[f_i] = f_images

    if formula_metrics:
        formula_metrics_df = pd.DataFrame(formula_metrics).set_index('formula_i')
    else:
        formula_metrics_df = EMPTY_METRICS_DF.set_index('formula_i')

    return formula_metrics_df, formula_images


def formula_image_metrics(
    formula_images_it: Iterable[FormulaImageItem],
    compute_metrics: ComputeMetricsFunc,
    target_formula_inds: Set[int],
    targeted_database_formula_inds: Set[int],
    n_peaks: int,
    min_px: int,
    compute_unused_metrics: bool,
) -> Tuple[pd.DataFrame, Dict]:
    formula_image_set_it = iter_images_in_sets(
        formula_images_it,
        n_peaks,
        target_formula_inds,
        targeted_database_formula_inds,
    )
    metrics_it = compute_and_filter_metrics(
        formula_image_set_it,
        compute_metrics,
        min_px,
        compute_unused_metrics,
    )
    formula_metrics_df, formula_images = collect_metrics_as_df(metrics_it)
    return formula_metrics_df, formula_images
