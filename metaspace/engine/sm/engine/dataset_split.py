"""Subsetting a dataset's raw imzML/ibd files along ROI polygons.

Pure logic for the dataset-split feature: given a parent dataset's imzML/ibd and a set of ROI
polygons, work out which spectra fall inside each ROI and write a self-contained child
imzML/ibd pair per ROI.

Coordinate convention (critical, see ``plan_child``): ROI polygons are stored in *ion-image*
pixel space, which is the parent's raw imzML coordinates re-based so the minimum is at the
origin — exactly what ``sm.engine.annotation.imzml_reader.ImzMLReader.__init__`` does. Using the
raw imzML coordinates instead would shift every ROI by the parent's origin offset and quietly
select the wrong pixels.

This module does no database or queue work; the daemon side lives in
``sm.engine.daemons.dataset_manager``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image
from pyimzml.ImzMLParser import ImzMLParser, SIZE_DICT
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.errors import SMError
from sm.engine.postprocessing.experiment_masks import rasterise_roi_mask

logger = logging.getLogger('engine')

# Ranged reads that are closer together than this are merged into one request. Sized to trade a
# little wasted transfer for far fewer round trips: a contiguous ROI ends up reading almost
# sequentially, while a small scattered ROI still only transfers what it needs.
MAX_COALESCE_GAP = 4 * 2**20
# Upper bound on a single buffered read, to keep peak memory bounded regardless of ROI size.
MAX_CHUNK_SIZE = 64 * 2**20

# pyimzml reports precision as struct format characters; ImzMLWriter wants numpy dtypes.
PRECISION_TO_DTYPE = {'f': np.float32, 'd': np.float64, 'i': np.int32, 'l': np.int64}


class DatasetSplitError(SMError):
    """Raised when a dataset cannot be split (bad ROI, unsupported file, empty selection)."""


def parse_input_path(input_path: str) -> Tuple[str, str]:
    """Split an ``s3a://bucket/uuid`` dataset input path into ``(bucket, uuid)``.

    Mirrors ``DatasetFiles._get_bucket_and_uuid`` in ``sm.rest.imzml_browser_manager``.
    """
    parts = (input_path or '').rstrip('/').split('/')
    if len(parts) < 2 or not parts[-1] or not parts[-2]:
        raise DatasetSplitError(f'Cannot parse dataset input path: {input_path!r}')
    return parts[-2], parts[-1]


@dataclass
class ParentFormat:
    """The parent file's storage format, threaded through to the child writer verbatim."""

    mode: str  # 'continuous' or 'processed'
    spec_type: str  # 'centroid' or 'profile'
    mz_dtype: type
    intensity_dtype: type
    polarity: Optional[str]


def read_parent_format(parser: ImzMLParser) -> ParentFormat:
    """Extract the storage format of an already-parsed imzML file.

    Raises if the parent declares binary compression: pyimzml's parser reads the ibd with plain
    ``seek``/``read`` + ``np.frombuffer`` and has no decompression support at all, so such a file
    cannot be read correctly here (nor annotated by METASPACE in the first place). Failing loudly
    beats writing a child whose header and bytes disagree.
    """
    file_params = parser.metadata.file_description.param_by_name

    if 'continuous' in file_params:
        mode = 'continuous'
    elif 'processed' in file_params:
        mode = 'processed'
    else:
        # imzML requires one of the two; default to the safer of them if the file omits it.
        logger.warning('imzML declares neither continuous nor processed mode, assuming processed')
        mode = 'processed'

    spec_type = 'profile' if 'profile spectrum' in file_params else 'centroid'

    for group_id in (parser.mzGroupId, parser.intGroupId):
        group = parser.metadata.referenceable_param_groups.get(group_id)
        params = group.param_by_name if group is not None else {}
        compression = [name for name in params if name.endswith('compression')]
        if any(name != 'no compression' for name in compression):
            raise DatasetSplitError(
                f'Cannot split a dataset with compressed binary data ({", ".join(compression)}). '
                f'Only uncompressed ibd files are supported.'
            )

    return ParentFormat(
        mode=mode,
        spec_type=spec_type,
        mz_dtype=PRECISION_TO_DTYPE[parser.mzPrecision],
        intensity_dtype=PRECISION_TO_DTYPE[parser.intensityPrecision],
        polarity=parser.polarity,
    )


def rebase_coordinates(coordinates: Sequence[Tuple]) -> Tuple[np.ndarray, np.ndarray, int, int]:
    """Convert raw imzML coordinates to the ion-image grid ROI polygons are drawn on.

    Returns ``(xs, ys, width, height)``. Identical to the re-basing in ``ImzMLReader.__init__``,
    which is what makes the returned grid line up with the stored TIC image and hence with the
    ROI polygons.
    """
    coords = np.array(coordinates)[:, :2]
    coords = coords - np.min(coords, axis=0)
    width, height = np.max(coords, axis=0) + 1
    return coords[:, 0], coords[:, 1], int(width), int(height)


@dataclass
class ChildSpec:
    """Everything needed to write one child dataset, derived from one ROI."""

    roi_id: Optional[int]
    roi_name: str
    sp_idxs: np.ndarray  # indices into parser.coordinates, in parent acquisition order
    crop_origin: Tuple[int, int]  # (x0, y0) in the parent's re-based ion-image space
    n_pixels: int  # unique pixels, which is what the ROI size floor applies to
    width: int
    height: int


def plan_child(
    coordinates: Sequence[Tuple],
    roi_geojson: Dict[str, Any],
    roi_id: Optional[int],
    roi_name: str,
) -> ChildSpec:
    """Work out which spectra of the parent fall inside one ROI.

    ``rasterise_roi_mask`` is reused verbatim rather than reimplemented so that the child contains
    exactly the pixels the user saw highlighted in the ROI editor and exactly the pixels their
    differential analysis used — including whatever PIL does at the polygon boundary.

    Every spectrum at a selected coordinate is kept, including duplicates at the same (x, y) and
    separate z-slices, so the child reproduces the parent's file semantics.
    """
    xs, ys, width, height = rebase_coordinates(coordinates)

    mask = rasterise_roi_mask(roi_geojson, roi_id, width, height)
    if mask is None:
        raise DatasetSplitError(f'ROI "{roi_name}" has no usable polygon')

    sp_idxs = np.flatnonzero(mask[ys, xs] > 0)
    if sp_idxs.size == 0:
        raise DatasetSplitError(
            f'ROI "{roi_name}" does not overlap any spectra — it may have been drawn '
            f'outside the sample area'
        )

    sel_xs, sel_ys = xs[sp_idxs], ys[sp_idxs]
    origin_x, origin_y = int(sel_xs.min()), int(sel_ys.min())
    n_pixels = len(np.unique(sel_ys.astype(np.int64) * width + sel_xs.astype(np.int64)))

    return ChildSpec(
        roi_id=roi_id,
        roi_name=roi_name,
        sp_idxs=sp_idxs,
        crop_origin=(origin_x, origin_y),
        n_pixels=n_pixels,
        width=int(sel_xs.max()) - origin_x + 1,
        height=int(sel_ys.max()) - origin_y + 1,
    )


class CoalescingRangeReader:
    """A seekable, read-only file-like view over a remote ibd that batches ranged reads.

    ``ImzMLParser.read_spectrum_from_file`` only needs ``seek``/``read``, so this can stand in for
    a local file handle. Given the set of byte ranges that will be requested, nearby ranges are
    merged into single fetches: a contiguous ROI degrades to sequential reads, a sparse one to a
    handful of scattered reads, and neither issues one request per spectrum.
    """

    def __init__(
        self,
        fetch: Callable[[int, int], bytes],
        max_gap: int = MAX_COALESCE_GAP,
        max_chunk: int = MAX_CHUNK_SIZE,
    ):
        self._fetch = fetch
        self._max_gap = max_gap
        self._max_chunk = max_chunk
        self._chunks: List[Tuple[int, int]] = []
        self._buf: bytes = b''
        self._buf_start = -1
        self._pos = 0
        self.bytes_fetched = 0

    def plan(self, ranges: Sequence[Tuple[int, int]]) -> None:
        """Declare the ``(offset, length)`` ranges that will be read, so they can be merged."""
        chunks: List[Tuple[int, int]] = []
        for start, length in sorted(ranges):
            end = start + length
            if chunks and start - chunks[-1][1] <= self._max_gap:
                prev_start, prev_end = chunks[-1]
                if end - prev_start <= self._max_chunk:
                    chunks[-1] = (prev_start, max(prev_end, end))
                    continue
            chunks.append((start, end))
        self._chunks = chunks

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self._pos = offset
        elif whence == 1:
            self._pos += offset
        else:
            raise ValueError(f'Unsupported whence: {whence}')
        return self._pos

    def tell(self) -> int:
        return self._pos

    def read(self, size: int) -> bytes:
        start, end = self._pos, self._pos + size
        if not (self._buf_start >= 0 and self._buf_start <= start and end <= self._buf_end):
            self._load(start, end)
        self._pos = end
        offset = start - self._buf_start
        return self._buf[offset : offset + size]

    @property
    def _buf_end(self) -> int:
        return self._buf_start + len(self._buf)

    def _load(self, start: int, end: int) -> None:
        chunk = next((c for c in self._chunks if c[0] <= start and end <= c[1]), None)
        if chunk is None:
            # Not covered by the plan (or no plan given) — fetch exactly what was asked for.
            chunk = (start, end)
        self._buf_start = chunk[0]
        self._buf = self._fetch(chunk[0], chunk[1] - chunk[0])
        self.bytes_fetched += len(self._buf)


def s3_range_fetcher(s3_client, bucket: str, key: str) -> Callable[[int, int], bytes]:
    """Build a ``(offset, length) -> bytes`` fetcher backed by S3 ranged GETs."""

    def fetch(offset: int, length: int) -> bytes:
        response = s3_client.get_object(
            Bucket=bucket, Key=key, Range=f'bytes={offset}-{offset + length - 1}'
        )
        return response['Body'].read()

    return fetch


def local_range_fetcher(path: Path) -> Callable[[int, int], bytes]:
    """Build a ``(offset, length) -> bytes`` fetcher backed by a local file (used in tests)."""

    def fetch(offset: int, length: int) -> bytes:
        with open(path, 'rb') as file:
            file.seek(offset)
            return file.read(length)

    return fetch


@dataclass
class ChildFiles:
    imzml_path: Path
    ibd_path: Path
    imzml_size: int
    ibd_size: int


def spectrum_ranges(parser: ImzMLParser, sp_idxs: Sequence[int]) -> List[Tuple[int, int]]:
    """Byte ranges in the ibd covering the m/z and intensity arrays of the given spectra."""
    mz_size = SIZE_DICT[parser.mzPrecision]
    int_size = SIZE_DICT[parser.intensityPrecision]
    ranges = []
    for idx in sp_idxs:
        ranges.append((parser.mzOffsets[idx], parser.mzLengths[idx] * mz_size))
        ranges.append((parser.intensityOffsets[idx], parser.intensityLengths[idx] * int_size))
    return ranges


def write_child_imzml(
    parser: ImzMLParser,
    ibd_reader: CoalescingRangeReader,
    spec: ChildSpec,
    fmt: ParentFormat,
    out_path: Path,
) -> ChildFiles:
    """Write one child imzML/ibd pair containing only ``spec``'s spectra.

    Child coordinates are re-based to (1, 1) so the child is a self-contained dataset cropped to
    the ROI's bounding box; ``spec.crop_origin`` is what maps them back to the parent. The z
    coordinate is preserved as-is.
    """
    ibd_reader.plan(spectrum_ranges(parser, spec.sp_idxs))
    spectrum_reader = parser.portable_spectrum_reader()

    # Raw imzML coordinate → child coordinate, in one shift: undo the parent's origin offset,
    # apply the ROI crop, and re-base to 1 (the imzML convention).
    raw_origin = np.min(np.array(parser.coordinates)[:, :2], axis=0)
    shift_x = int(raw_origin[0]) + spec.crop_origin[0] - 1
    shift_y = int(raw_origin[1]) + spec.crop_origin[1] - 1

    with ImzMLWriter(
        str(out_path),
        mode=fmt.mode,
        spec_type=fmt.spec_type,
        mz_dtype=fmt.mz_dtype,
        intensity_dtype=fmt.intensity_dtype,
        polarity=fmt.polarity,
    ) as writer:
        for idx in spec.sp_idxs:
            mzs, ints = spectrum_reader.read_spectrum_from_file(ibd_reader, idx)
            coord = parser.coordinates[idx]
            z_coord = coord[2] if len(coord) > 2 else 1
            writer.addSpectrum(mzs, ints, (coord[0] - shift_x, coord[1] - shift_y, z_coord))

    imzml_path = Path(f'{out_path}.imzML')
    ibd_path = Path(f'{out_path}.ibd')
    logger.info(
        f'Wrote child "{spec.roi_name}": {len(spec.sp_idxs)} spectra, '
        f'{spec.n_pixels} pixels, {ibd_reader.bytes_fetched} bytes read from parent'
    )
    return ChildFiles(
        imzml_path=imzml_path,
        ibd_path=ibd_path,
        imzml_size=imzml_path.stat().st_size,
        ibd_size=ibd_path.stat().st_size,
    )


def _apply_homography(matrix: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Apply a 3x3 homography to an Nx2 array of points."""
    homogeneous = np.hstack([points, np.ones((points.shape[0], 1))])
    projected = homogeneous @ matrix.T
    return projected[:, :2] / projected[:, 2:3]


def crop_optical_image(
    raw_image: Image.Image,
    transform: Sequence[Sequence[float]],
    child_width: int,
    child_height: int,
    crop_origin: Tuple[int, int],
) -> Tuple[Image.Image, List[List[float]]]:
    """Crop a parent's raw optical image to a child's region and adjust its transform.

    ``transform`` is the 3x3 homography METASPACE stores on the parent, mapping ion-image space
    onto the optical image (see ``sm.engine.optical_image._transform_image_to_ion_space``). The
    child's ion space is the parent's translated by ``crop_origin``, so the child's transform is
    the parent's pre-composed with that translation and post-composed with the crop offset.

    Cropping rather than reusing the whole slide keeps the optical source close in size to the
    child's ion image, which is the assumption the zoom-level scale factor relies on.
    """
    matrix = np.array(transform, dtype=float)
    if matrix.shape != (3, 3):
        raise DatasetSplitError(f'Expected a 3x3 optical transform, got shape {matrix.shape}')

    origin_x, origin_y = crop_origin
    translate_in = np.array([[1, 0, origin_x], [0, 1, origin_y], [0, 0, 1]], dtype=float)
    uncropped = matrix @ translate_in

    corners = np.array(
        [[0, 0], [child_width, 0], [child_width, child_height], [0, child_height]], dtype=float
    )
    optical_corners = _apply_homography(uncropped, corners)

    left = max(0, int(np.floor(optical_corners[:, 0].min())))
    top = max(0, int(np.floor(optical_corners[:, 1].min())))
    right = min(raw_image.width, int(np.ceil(optical_corners[:, 0].max())))
    bottom = min(raw_image.height, int(np.ceil(optical_corners[:, 1].max())))
    if right <= left or bottom <= top:
        raise DatasetSplitError('Child region falls outside the optical image')

    translate_out = np.array([[1, 0, -left], [0, 1, -top], [0, 0, 1]], dtype=float)
    child_transform = translate_out @ uncropped

    return raw_image.crop((left, top, right, bottom)), child_transform.tolist()
