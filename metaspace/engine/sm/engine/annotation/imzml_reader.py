from __future__ import annotations
from pathlib import Path
from threading import Lock
from traceback import format_exc
from typing import TYPE_CHECKING, Sequence

import numpy as np
from pyimzml.ImzMLParser import ImzMLParser
from scipy.sparse import coo_matrix

from sm.engine.errors import ImzMLError

from sm.engine.util import find_file_by_ext

if TYPE_CHECKING:
    from lithops import Storage
    from lithops.storage.utils import CloudObject

TIC_ACCESSION = 'MS:1000285'
MIN_MZ_ACCESSION = 'MS:1000528'
MAX_MZ_ACCESSION = 'MS:1000527'
METADATA_FIELDS = [TIC_ACCESSION, MIN_MZ_ACCESSION, MAX_MZ_ACCESSION]

# Lock for LithopsImzMLReader.iter_spectra (which is called from many threads) to access
# _process_spectrum (not thread-safe). This can't be included in the class as it's not pickleable
_process_spectrum_lock = Lock()


class ImzMLReader:
    """This class bundles the ability to somehow access ImzML data (implemented in subclasses)
    with some commonly-used pre-computed data such as the mask image and the mapping between
    spectrum index and pixel index.  Additionally, it provides a central place to efficiently
    intercept and gather additional data while the file is being read, to minimize I/O for things
    like

    The main purpose of this class is to consolidate functionality that's shared between
    the Lithops and Spark implementations and migration scripts.
    """

    def __init__(self, imzml_parser: ImzMLParser):
        coordinates = np.array(imzml_parser.coordinates)[:, :2]
        coordinates -= np.min(coordinates, axis=0)
        self.n_spectra = coordinates.shape[0]
        self.ys, self.xs = coordinates[:, 1], coordinates[:, 0]
        self.w, self.h = np.max(coordinates, axis=0) + 1
        # pixel_indexes - spectrum index to pixel index mapping. Pixel indexes (referred to as sp_i
        # in many places) are simply `Y * width + X`, allowing easy reshaping into a 2D image
        # without needing to compensate for missing spectra.
        # NOTE: ImzML reports coordinates in X,Y order, but all other code uses Y,X order as it
        # is a more commonly accepted way to do image processing.
        self.pixel_indexes = self.ys * self.w + self.xs

        # Add 2D mask
        sample_area_mask = np.zeros(self.h * self.w, dtype=bool)
        sample_area_mask[self.pixel_indexes] = True
        self.mask = sample_area_mask.reshape(self.h, self.w)

        # raw_coord_bounds is the RAW min/max coordinates, purely for diagnostics
        self.raw_coord_bounds = (
            np.min(imzml_parser.coordinates, axis=0),
            np.max(imzml_parser.coordinates, axis=0),
        )

        self.metadata_summary = imzml_parser.metadata.pretty()

        min_mz_metadata = imzml_parser.spectrum_metadata_fields[MIN_MZ_ACCESSION]
        max_mz_metadata = imzml_parser.spectrum_metadata_fields[MAX_MZ_ACCESSION]
        self.is_mz_from_metadata = all(
            mz is not None for arr in [min_mz_metadata, max_mz_metadata] for mz in arr
        )
        self.min_mz = np.min(min_mz_metadata) if self.is_mz_from_metadata else np.inf
        self.max_mz = np.max(max_mz_metadata) if self.is_mz_from_metadata else -np.inf

        self.mz_precision = imzml_parser.mzPrecision

        tic_metadata = imzml_parser.spectrum_metadata_fields[TIC_ACCESSION]
        self.is_tic_from_metadata = all(tic is not None for tic in tic_metadata)
        if self.is_tic_from_metadata:
            self._sp_tic = np.array(tic_metadata, dtype='f')
        else:
            self._sp_tic = np.full(self.n_spectra, np.nan, dtype='f')

    def spectrum_vals_to_image(self, values):
        image = coo_matrix((values, (self.ys, self.xs)), shape=(self.h, self.w)).toarray()
        image[~self.mask] = np.nan
        return image

    def tic_image(self):
        if not self.is_tic_from_metadata:
            assert (~np.isnan(self._sp_tic)).all(), 'Read all spectra before calling tic_image'
        return self.spectrum_vals_to_image(self._sp_tic)

    def _process_spectrum(self, idx, mzs, ints):
        # Remove zero-intensity peaks, as some export processes generate them in large numbers,
        # but they add no value at all.
        nonzero_ints_mask = ints > 0
        if not np.all(nonzero_ints_mask):
            mzs, ints = mzs[nonzero_ints_mask], ints[nonzero_ints_mask]

        # Populate TIC
        if not self.is_tic_from_metadata:
            self._sp_tic[idx] = np.sum(ints)

        # Populate min/max m/zs
        if len(mzs) and not self.is_mz_from_metadata:
            self.min_mz = min(self.min_mz, np.min(mzs))
            self.max_mz = max(self.max_mz, np.max(mzs))

        return idx, mzs, ints

    # iter_spectra method has an intentionally implementation-dependent signature,
    # as the Lithops implementation needs an external reference to Storage to remain pickleable


class FSImzMLReader(ImzMLReader):
    def __init__(self, path: Path):
        self.filename = find_file_by_ext(path, 'imzml')
        try:
            self._imzml_parser = ImzMLParser(
                self.filename,
                parse_lib='ElementTree',
                include_spectra_metadata=METADATA_FIELDS,
            )
        except Exception as e:
            raise ImzMLError(format_exc()) from e

        super().__init__(self._imzml_parser)

    def iter_spectra(self, sp_idxs: Sequence[int]):
        for sp_idx in sp_idxs:
            mzs, ints = self._imzml_parser.getspectrum(sp_idx)
            assert len(mzs) == self._imzml_parser.mzLengths[sp_idx], 'Incomplete .ibd file'
            assert len(ints) == self._imzml_parser.intensityLengths[sp_idx], 'Incomplete .ibd file'
            assert len(mzs) == len(ints), f"Spectrum {sp_idx} mz and intensity counts don't match"
            sp_idx, mzs, ints = self._process_spectrum(sp_idx, mzs, ints)
            yield sp_idx, mzs, ints


class LithopsImzMLReader(ImzMLReader):
    def __init__(self, storage: Storage, imzml_cobject: CloudObject, ibd_cobject: CloudObject):
        try:
            imzml_parser = ImzMLParser(
                storage.get_cloudobject(imzml_cobject, stream=True),
                ibd_file=None,
                parse_lib='ElementTree',
                include_spectra_metadata=METADATA_FIELDS,
            )
        except Exception as e:
            raise ImzMLError(format_exc()) from e

        self._ibd_cobject = ibd_cobject
        self.imzml_reader = imzml_parser.portable_spectrum_reader()

        super().__init__(imzml_parser)

    def iter_spectra(self, storage: Storage, sp_inds: Sequence[int]):
        # pylint: disable=import-outside-toplevel # avoid pulling Lithops into Spark pipeline
        from sm.engine.annotation_lithops.io import get_ranges_from_cobject

        mz_starts = np.array(self.imzml_reader.mzOffsets)[sp_inds]
        mz_ends = (
            mz_starts
            + np.array(self.imzml_reader.mzLengths)[sp_inds] * np.dtype(self.mz_precision).itemsize
        )
        mz_ranges = np.stack([mz_starts, mz_ends], axis=1)
        int_starts = np.array(self.imzml_reader.intensityOffsets)[sp_inds]
        int_ends = (
            int_starts
            + np.array(self.imzml_reader.intensityLengths)[sp_inds]
            * np.dtype(self.imzml_reader.intensityPrecision).itemsize
        )
        int_ranges = np.stack([int_starts, int_ends], axis=1)
        ranges_to_read = np.vstack([mz_ranges, int_ranges])
        data_ranges = get_ranges_from_cobject(storage, self._ibd_cobject, ranges_to_read)
        mz_data = data_ranges[: len(sp_inds)]
        int_data = data_ranges[len(sp_inds) :]
        del data_ranges

        for i, sp_idx in enumerate(sp_inds):
            # Copy the arrays, as np.frombuffer only makes a view over the existing buffer,
            # and this should avoid holding references to the source data as they may be slices
            # of larger arrays that should be GC'd.
            mzs = np.frombuffer(mz_data[i], dtype=self.imzml_reader.mzPrecision).copy()
            ints = np.frombuffer(int_data[i], dtype=self.imzml_reader.intensityPrecision).copy()
            mz_data[i] = None  # type: ignore # Avoid holding memory longer than necessary
            int_data[i] = None  # type: ignore
            assert len(mzs) == self.imzml_reader.mzLengths[sp_idx], 'Incomplete .ibd file'
            assert len(ints) == self.imzml_reader.intensityLengths[sp_idx], 'Incomplete .ibd file'
            assert len(mzs) == len(ints), f"Spectrum {sp_idx} mz and intensity counts don't match"

            # _process_spectrum isn't thread-safe, so only access it in a mutex
            with _process_spectrum_lock:
                sp_idx, mzs, ints = self._process_spectrum(sp_idx, mzs, ints)

            yield sp_idx, mzs, ints
